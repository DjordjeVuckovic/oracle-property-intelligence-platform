import { mkdir, readdir, readFile, writeFile, appendFile, symlink, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import { createPool, createDb, schema } from "@oracle/db";
import { consolidatedPropertySchema, logger } from "@oracle/shared";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { from as copyFrom } from "pg-copy-streams";

import { parseIngestArgv } from "../lib/argv.js";
import { emptyRowSets, type RowSets, mapRecord } from "../pipeline/map-record.js";
import { BatchLoader } from "../pipeline/load.js";

type TableName = keyof RowSets;

const TABLE_NAMES = Object.keys(emptyRowSets()) as TableName[];
const SOURCE_CONSOLIDATED_DIR = "consolidated";
const SOURCE_BACKBONE_FILE = "lee-county.parquet";

function resolveStagingRoot(dataDir: string, stagingDir: string): string {
  return stagingDir.startsWith(dataDir) ? stagingDir : join(dataDir, "staging", stagingDir);
}

async function ensureSymlink(target: string, linkPath: string): Promise<void> {
  await mkdir(dirname(linkPath), { recursive: true });
  try {
    await symlink(target, linkPath);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : null;
    if (code !== "EEXIST") throw error;
  }
}

function runDuckDb(sqlText: string): void {
  const result = spawnSync("duckdb", ["-c", sqlText], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`duckdb failed for SQL: ${sqlText}`);
  }
}

async function appendJsonLines(path: string, lines: readonly string[]): Promise<void> {
  if (lines.length === 0) return;
  await appendFile(path, `${lines.join("\n")}\n`);
}

async function stageIpfs(commandArgs: ReturnType<typeof parseIngestArgv>): Promise<void> {
  const sourceConsolidatedDir = join(commandArgs.dataDir, SOURCE_CONSOLIDATED_DIR);
  const sourceBackboneFile = join(commandArgs.dataDir, SOURCE_BACKBONE_FILE);
  const stagingRoot = resolveStagingRoot(commandArgs.dataDir, commandArgs.stagingDir);
  const sourceStageDir = join(stagingRoot, "source");
  const tablesDir = join(stagingRoot, "tables");
  const tmpDir = join(stagingRoot, "tmp");

  await mkdir(sourceStageDir, { recursive: true });
  await mkdir(tablesDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  await ensureSymlink(sourceConsolidatedDir, join(sourceStageDir, SOURCE_CONSOLIDATED_DIR));
  await ensureSymlink(sourceBackboneFile, join(sourceStageDir, SOURCE_BACKBONE_FILE));

  const files = (await readdir(sourceConsolidatedDir)).filter((file) => file.endsWith(".json")).sort();
  const selectedFiles = commandArgs.limit === null ? files : files.slice(0, commandArgs.limit);
  const workerCount = Math.max(1, Math.trunc(commandArgs.workers));
  const flushEvery = 250;
  const workerSummaries: Array<{
    readonly workerId: number;
    readonly processed: number;
    readonly skipped: number;
    readonly rows: Record<string, number>;
  }> = [];

  logger.info(
    {
      sourceConsolidatedDir,
      sourceBackboneFile,
      stagingRoot,
      files: selectedFiles.length,
      workerCount,
    },
    "stage_ipfs_started",
  );

  const workerTasks = Array.from({ length: workerCount }, async (_unused, workerId) => {
    const shardDir = join(tmpDir, `worker-${workerId}`);
    await mkdir(shardDir, { recursive: true });
    const buffers = new Map<TableName, string[]>();
    const rowCounts = Object.fromEntries(TABLE_NAMES.map((table) => [table, 0])) as Record<string, number>;
    let processed = 0;
    let skipped = 0;

    const flush = async (): Promise<void> => {
      for (const table of TABLE_NAMES) {
        const lines = buffers.get(table);
        if (lines === undefined || lines.length === 0) continue;
        await appendJsonLines(join(shardDir, `${String(table)}.jsonl`), lines);
        lines.length = 0;
      }
    };

    for (let index = workerId; index < selectedFiles.length; index += workerCount) {
      const file = selectedFiles[index];
      if (file === undefined) continue;
      const cid = file.replace(/\.json$/, "");
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(await readFile(join(sourceConsolidatedDir, file), "utf8"));
      } catch {
        skipped += 1;
        continue;
      }
      const parsed = consolidatedPropertySchema.safeParse(parsedJson);
      if (!parsed.success) {
        skipped += 1;
        continue;
      }

      const rows = emptyRowSets();
      mapRecord(parsed.data, cid, rows);
      for (const table of TABLE_NAMES) {
        const tableRows = rows[table] as Record<string, unknown>[];
        if (tableRows.length === 0) continue;
        const lines = buffers.get(table) ?? [];
        for (const row of tableRows) {
          lines.push(JSON.stringify(row));
        }
        buffers.set(table, lines);
        rowCounts[String(table)] = (rowCounts[String(table)] ?? 0) + tableRows.length;
      }

      processed += 1;
      if (processed % flushEvery === 0) {
        await flush();
      }
    }

    await flush();
    workerSummaries.push({ workerId, processed, skipped, rows: rowCounts });
  });

  await Promise.all(workerTasks);

  for (const table of TABLE_NAMES) {
    const finalJsonl = join(tablesDir, `${String(table)}.jsonl`);
    await writeFile(finalJsonl, "");
    for (let workerId = 0; workerId < workerCount; workerId += 1) {
      const shard = join(tmpDir, `worker-${workerId}`, `${String(table)}.jsonl`);
      try {
        const content = await readFile(shard, "utf8");
        if (content.length > 0) {
          await appendFile(finalJsonl, content);
        }
      } catch {
        // Missing shard means the worker had no rows for this table.
      }
    }

    const parquetPath = join(tablesDir, `${String(table)}.parquet`);
    runDuckDb(
      `COPY (SELECT * FROM read_json_auto('${finalJsonl.replace(/'/g, "''")}')) TO '${parquetPath.replace(/'/g, "''")}' (FORMAT PARQUET);`,
    );
  }

  const consolidatedCount = selectedFiles.length;
  const backboneCountResult = spawnSync(
    "duckdb",
    [
      "-csv",
      "-c",
      `SELECT count(*) AS n FROM read_parquet('${join(sourceStageDir, SOURCE_BACKBONE_FILE).replace(/'/g, "''")}');`,
    ],
    { encoding: "utf8" },
  );
  if (backboneCountResult.status !== 0) {
    throw new Error("duckdb failed while counting staged backbone rows");
  }
  const backboneRows = Number(backboneCountResult.stdout.trim().split("\n").pop() ?? "0");

  const manifest = {
    runId: commandArgs.runId,
    createdAt: new Date().toISOString(),
    sourceConsolidatedDir,
    sourceBackboneFile,
    stagingRoot,
    consolidatedCount,
    backboneRows,
    workerCount,
    tables: TABLE_NAMES.reduce<Record<string, { jsonl: string; parquet: string }>>((acc, table) => {
      acc[String(table)] = {
        jsonl: join(tablesDir, `${String(table)}.jsonl`),
        parquet: join(tablesDir, `${String(table)}.parquet`),
      };
      return acc;
    }, {}),
    workers: workerSummaries,
  };

  await writeFile(join(stagingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(tmpDir, { recursive: true, force: true });

  logger.info(
    {
      consolidatedCount,
      backboneRows,
      tables: TABLE_NAMES.length,
      stagingRoot,
    },
    "stage_ipfs_complete",
  );
}

async function migrateDatabase(): Promise<void> {
  const pool = createPool();
  const db = createDb(pool);
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

  try {
    logger.info({ migrationsFolder }, "migrate_started");
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await migrate(db, { migrationsFolder });
    logger.info("migrate_complete");
  } finally {
    await pool.end();
  }
}

async function loadConsolidatedFromDir(sourceConsolidatedDir: string, runId: string): Promise<void> {
  const pool = createPool();
  const db = createDb(pool);
  const files = (await readdir(sourceConsolidatedDir)).filter((file) => file.endsWith(".json")).sort();

  logger.info({ files: files.length, sourceConsolidatedDir }, "load_consolidated_started");

  try {
    const [run] = await db
      .insert(schema.ingestionRuns)
      .values({
        stage: "load_consolidated",
        sourceSystem: "oracle-open-data",
        sourceUri: `staging://${runId}/consolidated`,
      })
      .returning({ id: schema.ingestionRuns.ingestionRunId });
    const runDbId = run!.id;

    const loader = new BatchLoader(db, Number(process.env.INGEST_LOAD_BATCH_SIZE ?? 1000));
    let processed = 0;
    let skipped = 0;
    const startedAt = Date.now();

    for (const file of files) {
      const cid = file.replace(/\.json$/, "");
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(join(sourceConsolidatedDir, file), "utf8"));
      } catch {
        skipped += 1;
        continue;
      }
      const parsed = consolidatedPropertySchema.safeParse(raw);
      if (!parsed.success) {
        skipped += 1;
        continue;
      }
      const rows = emptyRowSets();
      mapRecord(parsed.data, cid, rows);
      loader.add(rows);
      await loader.maybeFlush();
      processed += 1;
      if (processed % 1000 === 0) {
        logger.info(
          {
            processed,
            skipped,
            total: files.length,
            elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
          },
          "load_consolidated_progress",
        );
      }
    }

    await loader.flush();
    const counts = { ...loader.totals(), processed, skipped };
    await db
      .update(schema.ingestionRuns)
      .set({ status: "complete", counts, finishedAt: sql`now()` })
      .where(eq(schema.ingestionRuns.ingestionRunId, runDbId));

    logger.info({ counts, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) }, "load_consolidated_complete");
  } finally {
    await pool.end();
  }
}

async function loadBackboneFromParquet(parquetPath: string, runId: string): Promise<void> {
  const pool = createPool();
  const db = createDb(pool);
  try {
    logger.info({ parquetPath }, "backbone_load_started");
    const [run] = await db
    .insert(schema.ingestionRuns)
    .values({
      stage: "load_backbone",
      sourceSystem: "oracle-open-data",
      sourceUri: `staging://${runId}/backbone`,
    })
    .returning({ id: schema.ingestionRuns.ingestionRunId });

    await db.execute(sql`drop table if exists _backbone_staging`);
  await db.execute(sql`
    create unlogged table if not exists _backbone_staging (
      pid text, county_name text, state_code text, address_street text,
      address_city text, address_zip text, latitude double precision,
      longitude double precision, property_type text, property_usage_type text,
      built_year bigint, livable_floor_area double precision,
      total_area double precision, assessed_value double precision,
      market_value double precision, land_value double precision,
      owner_name text, owner_occupied boolean, subdivision text, property_cid text
    )
  `);

  const client = await pool.connect();
  try {
    const duck = spawn(
      "duckdb",
      [
        "-csv",
        "-noheader",
        "-c",
        `COPY (
          SELECT
            regexp_replace(parcel_identifier, '[^0-9]', '', 'g') AS pid,
            county_name, state_code, address_street, address_city, address_zip,
            latitude, longitude, property_type, property_usage_type, built_year,
            livable_floor_area, total_area, assessed_value, market_value, land_value,
            owner_name, owner_occupied, subdivision, property_cid
          FROM read_parquet('${parquetPath.replace(/'/g, "''")}')
          WHERE parcel_identifier IS NOT NULL
        ) TO STDOUT (FORMAT csv, HEADER false);`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    await new Promise<void>((resolve, reject) => {
      const stream = client.query(copyFrom("COPY _backbone_staging FROM STDIN WITH (FORMAT csv, NULL '')"));
      if (duck.stdout === null) {
        reject(new Error("duckdb stdout unavailable"));
        return;
      }
      duck.stdout.pipe(stream);
      stream.on("finish", resolve);
      stream.on("error", reject);
      duck.on("error", reject);
      duck.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`duckdb exited with code ${code}`));
        }
      });
    });
  } finally {
    client.release();
  }

  const staged = await db.execute(sql`select count(*) as n from _backbone_staging where pid <> ''`);
    logger.info({ staged: Number((staged.rows[0] as { n: number }).n) }, "backbone_staged");

  await db.execute(sql`
    insert into addresses (address_id, unnormalized_address, city_name, state_code, postal_code,
      county_name, latitude, longitude, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'address:parcel:' || pid),
      address_street, address_city, state_code, address_zip, coalesce(county_name, 'Lee'),
      latitude, longitude, 'oracle-open-data', 'address:parcel:' || pid,
      'ipfs://' || property_cid
    from _backbone_staging where pid <> ''
    on conflict do nothing
  `);

  await db.execute(sql`
    insert into parcels (parcel_id, request_identifier, parcel_identifier, county_name, state_code,
      source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'parcel:' || pid), pid, pid,
      coalesce(county_name, 'Lee'), state_code, 'oracle-open-data', 'parcel:' || pid,
      'ipfs://' || property_cid
    from _backbone_staging where pid <> ''
    on conflict do nothing
  `);

  await db.execute(sql`
    insert into properties (property_id, parcel_id, address_id, parcel_identifier, property_type,
      property_usage_type, property_structure_built_year, livable_floor_area, total_area,
      subdivision, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'property:' || pid),
      uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'parcel:' || pid),
      uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'address:parcel:' || pid),
      pid, property_type, property_usage_type, built_year,
      nullif(livable_floor_area, 0)::text, nullif(total_area, 0)::text, subdivision,
      'oracle-open-data', 'property:' || pid, 'ipfs://' || property_cid
    from _backbone_staging where pid <> ''
    on conflict do nothing
  `);

  await db.execute(sql`
    insert into taxes (property_id, property_assessed_value_amount, property_market_value_amount,
      property_land_amount, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'property:' || pid),
      assessed_value::numeric, market_value::numeric, land_value::numeric,
      'oracle-open-data', 'tax:' || pid || ':current', 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' and (assessed_value is not null or market_value is not null)
    on conflict do nothing
  `);

  await db.execute(sql`
    insert into ownerships (property_id, owned_by, owner_occupied_indicator,
      source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5('b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c'::uuid, 'property:' || pid), owner_name, owner_occupied,
      'oracle-open-data', 'ownership:' || pid || ':0', 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' and owner_name is not null
    on conflict do nothing
  `);

  await db.execute(sql`drop table if exists _backbone_staging`);
  const total = await db.execute(sql`select count(*) as n from properties`);
  await db
    .update(schema.ingestionRuns)
    .set({
      status: "complete",
      counts: { properties_total: Number((total.rows[0] as { n: number }).n) },
      finishedAt: sql`now()`,
    })
    .where(sql`ingestion_run_id = ${run!.id}`);

    logger.info({ properties: Number((total.rows[0] as { n: number }).n) }, "backbone_complete");
  } finally {
    await pool.end();
  }
}

async function verifyCritical(databaseUrl: string | null): Promise<void> {
  if (databaseUrl !== null) {
    process.env.DATABASE_URL = databaseUrl;
  }
  const pool = createPool();
  const db = createDb(pool);
  try {
    const scalar = async (query: ReturnType<typeof sql>): Promise<number> => {
      const result = await db.execute(query);
      const row = result.rows[0] ?? {};
      return Number(Object.values(row)[0] ?? 0);
    };

    const counts = {
      properties: await scalar(sql`select count(*)::bigint as n from properties`),
      propertyImprovements: await scalar(sql`select count(*)::bigint as n from property_improvements`),
      propertiesWithPermits: await scalar(sql`select count(distinct property_id)::bigint as n from property_improvements`),
      businessRegistrations: await scalar(sql`select count(*)::bigint as n from business_registrations`),
      propertiesWithSunbiz: await scalar(sql`select count(distinct property_id)::bigint as n from occupancies`),
      businessReputationProfiles: await scalar(sql`select count(*)::bigint as n from business_reputation_profiles`),
      businessReputationReviews: await scalar(sql`select count(*)::bigint as n from business_reputation_reviews`),
      businessReputationComplaints: await scalar(sql`select count(*)::bigint as n from business_reputation_complaints`),
      contractorQualityScores: await scalar(sql`select count(*)::bigint as n from contractor_quality_scores`),
      distinctOwners: await scalar(sql`select count(distinct owned_by)::bigint as n from ownerships`),
      propertyProfileView: await scalar(sql`select count(*)::bigint as n from property_profile_view`),
      permitSearchView: await scalar(sql`select count(*)::bigint as n from permit_search_view`),
      companyProfileView: await scalar(sql`select count(*)::bigint as n from company_profile_view`),
      addressProfileView: await scalar(sql`select count(*)::bigint as n from address_profile_view`),
    };

    const expected = {
      properties: 511695,
      propertyImprovementsMin: 175000,
      propertiesWithPermits: 26965,
      businessRegistrations: 685,
      propertiesWithSunbiz: 42407,
      businessReputationProfiles: 112,
      businessReputationReviews: 33154,
      businessReputationComplaints: 25627,
      contractorQualityScores: 112,
      distinctOwners: 410076,
    } as const;

    if (counts.properties !== expected.properties) {
      throw new Error(`properties count mismatch: expected ${expected.properties}, got ${counts.properties}`);
    }
    if (counts.propertyImprovements < expected.propertyImprovementsMin) {
      throw new Error(`property_improvements too low: expected at least ${expected.propertyImprovementsMin}, got ${counts.propertyImprovements}`);
    }
    if (counts.propertiesWithPermits !== expected.propertiesWithPermits) {
      throw new Error(`properties_with_permits mismatch: expected ${expected.propertiesWithPermits}, got ${counts.propertiesWithPermits}`);
    }
    if (counts.propertiesWithSunbiz !== expected.propertiesWithSunbiz) {
      throw new Error(`properties_with_sunbiz mismatch: expected ${expected.propertiesWithSunbiz}, got ${counts.propertiesWithSunbiz}`);
    }
    if (counts.businessReputationProfiles !== expected.businessReputationProfiles) {
      throw new Error(`business_reputation_profiles mismatch: expected ${expected.businessReputationProfiles}, got ${counts.businessReputationProfiles}`);
    }
    if (counts.businessReputationReviews < expected.businessReputationReviews) {
      throw new Error(`business_reputation_reviews too low: expected at least ${expected.businessReputationReviews}, got ${counts.businessReputationReviews}`);
    }
    if (counts.businessReputationComplaints < expected.businessReputationComplaints) {
      throw new Error(`business_reputation_complaints too low: expected at least ${expected.businessReputationComplaints}, got ${counts.businessReputationComplaints}`);
    }
    if (counts.contractorQualityScores !== expected.contractorQualityScores) {
      throw new Error(`contractor_quality_scores mismatch: expected ${expected.contractorQualityScores}, got ${counts.contractorQualityScores}`);
    }
    if (counts.distinctOwners !== expected.distinctOwners) {
      throw new Error(`distinct owners mismatch: expected ${expected.distinctOwners}, got ${counts.distinctOwners}`);
    }
    if (counts.propertyProfileView === 0 || counts.permitSearchView === 0 || counts.companyProfileView === 0 || counts.addressProfileView === 0) {
      throw new Error("one or more profile views are empty");
    }

    logger.info({ counts }, "verify_critical_ok");
  } finally {
    await pool.end();
  }
}

async function run(): Promise<void> {
  const args = parseIngestArgv();
  if (args.command === "stage-ipfs") {
    await stageIpfs(args);
    return;
  }

  if (args.command === "load-staging" || args.command === "full") {
    if (args.databaseUrl !== null) {
      process.env.DATABASE_URL = args.databaseUrl;
    }
    process.env.DATABASE_SSL = args.databaseSsl;
    const stagingRoot = resolveStagingRoot(args.dataDir, args.stagingDir);
    const sourceConsolidatedDir = join(stagingRoot, "source", SOURCE_CONSOLIDATED_DIR);
    const sourceBackboneFile = join(stagingRoot, "source", SOURCE_BACKBONE_FILE);
    logger.info(
      {
        stagingRoot,
        sourceConsolidatedDir,
        sourceBackboneFile,
        databaseSsl: args.databaseSsl,
      },
      "load_staging_started",
    );
    await migrateDatabase();
    await loadConsolidatedFromDir(sourceConsolidatedDir, args.runId);
    await loadBackboneFromParquet(sourceBackboneFile, args.runId);
    if (args.command === "full") {
      await verifyCritical(args.databaseUrl);
    }
    return;
  }

  if (args.command === "verify-critical") {
    logger.info({ databaseUrl: args.databaseUrl !== null ? "set" : "env" }, "verify_started");
    await verifyCritical(args.databaseUrl);
    return;
  }

  throw new Error(`Unhandled ingest command: ${String(args.command)}`);
}

run().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "ingest_failed");
  process.exit(1);
});
