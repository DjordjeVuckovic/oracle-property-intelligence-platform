import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Database } from "@oracle/db";
import { schema } from "@oracle/db";
import { logger } from "@oracle/shared";
import { eq, sql } from "drizzle-orm";

import { ORACLE_NAMESPACE } from "@oracle/shared";
import { duckdbAttachDsn, duckdbEnv, pgConn } from "../lib/pg-conn.js";
import { sqlTableName, TABLE_ORDER } from "../pipeline/columns.js";

// Bulk load engine. CSV-free: the duckdb `postgres` extension ATTACHes the same
// database and streams each staged parquet straight into an unlogged staging
// table (`INSERT ... BY NAME` tolerates the column subset), then a single
// `INSERT ... SELECT ... ON CONFLICT DO NOTHING` moves rows into the real table,
// enforcing unique/FK/NOT NULL and deduping by (source_system, source_record_key).
// Orders of magnitude faster than row-by-row, and it never touches CSV so
// free-text fields (project_description, review_text) can't corrupt the load.

function runDuckdb(statements: string): void {
  const dsn = duckdbAttachDsn(pgConn());
  const preamble = `INSTALL postgres; LOAD postgres; ATTACH '${dsn}' AS pg (TYPE postgres);`;
  const result = spawnSync("duckdb", ["-c", `${preamble}\n${statements}`], {
    env: duckdbEnv(pgConn()),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`duckdb failed: ${result.stderr || result.stdout}`);
  }
}

async function scalar(db: Database, query: ReturnType<typeof sql>): Promise<number> {
  const res = await db.execute(query);
  return Number(Object.values(res.rows[0] ?? {})[0] ?? 0);
}

// Load the per-table staged parquet files into their normalized tables.
async function loadTables(db: Database, tablesDir: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const rowKey of TABLE_ORDER) {
    const name = sqlTableName(rowKey);
    const parquet = join(tablesDir, `${name}.parquet`);
    if (!existsSync(parquet)) {
      logger.warn({ name }, "load_table_skipped_missing_parquet");
      continue;
    }
    const stg = `_stg_${name}`;
    const before = await scalar(db, sql`select count(*) from ${sql.identifier(name)}`);
    await db.execute(sql`drop table if exists ${sql.identifier(stg)}`);
    await db.execute(
      sql`create unlogged table ${sql.identifier(stg)} (like ${sql.identifier(name)} including defaults)`
    );
    runDuckdb(
      `INSERT INTO pg.${stg} BY NAME SELECT * FROM read_parquet('${parquet.replace(/'/g, "''")}');`
    );
    await db.execute(
      sql`insert into ${sql.identifier(name)} select * from ${sql.identifier(stg)} on conflict do nothing`
    );
    await db.execute(sql`drop table ${sql.identifier(stg)}`);
    const after = await scalar(db, sql`select count(*) from ${sql.identifier(name)}`);
    counts[name] = after - before;
    logger.info({ name, inserted: after - before, total: after }, "load_table_complete");
  }
  return counts;
}

// Skeletal backbone: all 511k rows from the query-table parquet, ids computed
// with uuid_generate_v5 over the SAME namespace + keys as the JS loader so
// ON CONFLICT DO NOTHING leaves the enriched rows untouched and fills the rest.
async function loadBackbone(db: Database, backboneParquet: string): Promise<number> {
  const ns = ORACLE_NAMESPACE;
  await db.execute(sql`drop table if exists _backbone_staging`);
  await db.execute(sql`
    create unlogged table _backbone_staging (
      pid text, county_name text, state_code text, address_street text,
      address_city text, address_zip text, latitude double precision,
      longitude double precision, property_type text, property_usage_type text,
      built_year bigint, livable_floor_area double precision,
      total_area double precision, assessed_value double precision,
      market_value double precision, land_value double precision,
      owner_name text, owner_occupied boolean, subdivision text, property_cid text
    )
  `);
  runDuckdb(
    `INSERT INTO pg._backbone_staging BY NAME SELECT
       regexp_replace(parcel_identifier, '[^0-9]', '', 'g') AS pid,
       county_name, state_code, address_street, address_city, address_zip,
       latitude, longitude, property_type, property_usage_type, built_year,
       livable_floor_area, total_area, assessed_value, market_value, land_value,
       owner_name, owner_occupied, subdivision, property_cid
     FROM read_parquet('${backboneParquet.replace(/'/g, "''")}')
     WHERE parcel_identifier IS NOT NULL;`
  );

  await db.execute(sql`
    insert into addresses (address_id, unnormalized_address, city_name, state_code, postal_code,
      county_name, latitude, longitude, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${ns}::uuid, 'address:parcel:' || pid), address_street, address_city,
      state_code, address_zip, coalesce(county_name, 'Lee'), latitude, longitude,
      'oracle-open-data', 'address:parcel:' || pid, 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' on conflict do nothing
  `);
  await db.execute(sql`
    insert into parcels (parcel_id, request_identifier, parcel_identifier, county_name, state_code,
      source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${ns}::uuid, 'parcel:' || pid), pid, pid, coalesce(county_name, 'Lee'),
      state_code, 'oracle-open-data', 'parcel:' || pid, 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' on conflict do nothing
  `);
  await db.execute(sql`
    insert into properties (property_id, parcel_id, address_id, parcel_identifier, property_type,
      property_usage_type, property_structure_built_year, livable_floor_area, total_area,
      subdivision, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${ns}::uuid, 'property:' || pid),
      uuid_generate_v5(${ns}::uuid, 'parcel:' || pid),
      uuid_generate_v5(${ns}::uuid, 'address:parcel:' || pid),
      pid, property_type, property_usage_type, built_year,
      nullif(livable_floor_area, 0)::text, nullif(total_area, 0)::text, subdivision,
      'oracle-open-data', 'property:' || pid, 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' on conflict do nothing
  `);
  await db.execute(sql`
    insert into taxes (property_id, property_assessed_value_amount, property_market_value_amount,
      property_land_amount, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${ns}::uuid, 'property:' || pid), assessed_value::numeric,
      market_value::numeric, land_value::numeric, 'oracle-open-data',
      'tax:' || pid || ':current', 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' and (assessed_value is not null or market_value is not null)
    on conflict do nothing
  `);
  await db.execute(sql`
    insert into ownerships (property_id, owned_by, owner_occupied_indicator,
      source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${ns}::uuid, 'property:' || pid), owner_name, owner_occupied,
      'oracle-open-data', 'ownership:' || pid || ':0', 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' and owner_name is not null on conflict do nothing
  `);
  await db.execute(sql`drop table _backbone_staging`);
  return scalar(db, sql`select count(*) from properties`);
}

export async function runLoad(
  db: Database,
  opts: { tablesDir: string; backboneParquet: string; runId: string }
): Promise<void> {
  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({ stage: "load", sourceSystem: "oracle-open-data", sourceUri: `staging://${opts.runId}` })
    .returning({ id: schema.ingestionRuns.ingestionRunId });

  logger.info({ tablesDir: opts.tablesDir }, "load_tables_started");
  const tableCounts = await loadTables(db, opts.tablesDir);

  logger.info({ backboneParquet: opts.backboneParquet }, "load_backbone_started");
  const propertiesTotal = await loadBackbone(db, opts.backboneParquet);

  await db
    .update(schema.ingestionRuns)
    .set({
      status: "complete",
      counts: { ...tableCounts, properties_total: propertiesTotal },
      finishedAt: sql`now()`,
    })
    .where(eq(schema.ingestionRuns.ingestionRunId, run!.id));
  logger.info({ propertiesTotal }, "load_complete");
}
