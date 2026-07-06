import { spawn } from "node:child_process";
import { join } from "node:path";

import { createPool, createDb, schema } from "@oracle/db";
import { loadEnv, logger, ORACLE_NAMESPACE } from "@oracle/shared";
import { sql } from "drizzle-orm";
import { from as copyFrom } from "pg-copy-streams";

// Backbone stage: load skeletal parcels/properties/addresses/taxes/ownerships
// for ALL 511,695 rows straight from the query-table parquet, so the platform is
// real at full scale. Runs AFTER the enriched load; ids are computed with
// uuid_generate_v5 over the SAME namespace + key strings as the JS loader
// (idFor.*), so ON CONFLICT DO NOTHING leaves the ~66k rich rows untouched and
// only fills the ~445k gaps.

// Columns streamed out of the parquet, in this order (all NULLs as empty).
const PARQUET_SELECT = `
  regexp_replace(parcel_identifier, '[^0-9]', '', 'g') AS pid,
  county_name, state_code, address_street, address_city, address_zip,
  latitude, longitude, property_type, property_usage_type, built_year,
  livable_floor_area, total_area, assessed_value, market_value, land_value,
  owner_name, owner_occupied, subdivision, property_cid
`;

const STAGING_DDL = sql`
  create unlogged table if not exists _backbone_staging (
    pid text, county_name text, state_code text, address_street text,
    address_city text, address_zip text, latitude double precision,
    longitude double precision, property_type text, property_usage_type text,
    built_year bigint, livable_floor_area double precision,
    total_area double precision, assessed_value double precision,
    market_value double precision, land_value double precision,
    owner_name text, owner_occupied boolean, subdivision text, property_cid text
  )
`;

const NS = ORACLE_NAMESPACE;

async function main(): Promise<void> {
  const env = loadEnv();
  const parquet = join(env.INGEST_DATA_DIR, env.INGEST_PARQUET_FILE);
  const pool = createPool();
  const db = createDb(pool);

  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({ stage: "load_backbone", sourceSystem: "oracle-open-data", sourceUri: parquet })
    .returning({ id: schema.ingestionRuns.ingestionRunId });

  logger.info({ parquet }, "backbone_started");
  await db.execute(sql`drop table if exists _backbone_staging`);
  await db.execute(STAGING_DDL);

  // Stream parquet → CSV (via duckdb) → COPY into staging.
  const client = await pool.connect();
  try {
    const copyable = client.query(
      copyFrom(`COPY _backbone_staging FROM STDIN WITH (FORMAT csv, NULL '')`)
    );
    const duck = spawn("duckdb", [
      "-csv",
      "-noheader",
      "-c",
      `COPY (SELECT ${PARQUET_SELECT} FROM read_parquet('${parquet}') WHERE parcel_identifier IS NOT NULL) TO '/dev/stdout' (FORMAT csv, HEADER false);`,
    ]);
    duck.stderr.on("data", (d: Buffer) => logger.warn({ duckdb: d.toString() }, "duckdb_stderr"));
    await new Promise<void>((resolve, reject) => {
      duck.stdout.pipe(copyable);
      copyable.on("finish", resolve);
      copyable.on("error", reject);
      duck.on("error", reject);
      duck.on("close", (code) => {
        if (code !== 0) reject(new Error(`duckdb exited ${code}`));
      });
    });
  } finally {
    client.release();
  }

  const staged = await db.execute(sql`select count(*) as n from _backbone_staging where pid <> ''`);
  logger.info({ staged: Number((staged.rows[0] as { n: number }).n) }, "backbone_staged");

  // Skeletal upserts. Ids match idFor.* via uuid_generate_v5(namespace, key).
  logger.info("backbone_upsert_addresses");
  await db.execute(sql`
    insert into addresses (address_id, unnormalized_address, city_name, state_code, postal_code,
      county_name, latitude, longitude, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${NS}::uuid, 'address:parcel:' || pid),
      address_street, address_city, state_code, address_zip, coalesce(county_name, 'Lee'),
      latitude, longitude, 'oracle-open-data', 'address:parcel:' || pid,
      'ipfs://' || property_cid
    from _backbone_staging where pid <> ''
    on conflict do nothing
  `);

  logger.info("backbone_upsert_parcels");
  await db.execute(sql`
    insert into parcels (parcel_id, request_identifier, parcel_identifier, county_name, state_code,
      source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${NS}::uuid, 'parcel:' || pid), pid, pid, coalesce(county_name, 'Lee'),
      state_code, 'oracle-open-data', 'parcel:' || pid, 'ipfs://' || property_cid
    from _backbone_staging where pid <> ''
    on conflict do nothing
  `);

  logger.info("backbone_upsert_properties");
  await db.execute(sql`
    insert into properties (property_id, parcel_id, address_id, parcel_identifier, property_type,
      property_usage_type, property_structure_built_year, livable_floor_area, total_area,
      subdivision, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${NS}::uuid, 'property:' || pid),
      uuid_generate_v5(${NS}::uuid, 'parcel:' || pid),
      uuid_generate_v5(${NS}::uuid, 'address:parcel:' || pid),
      pid, property_type, property_usage_type, built_year,
      nullif(livable_floor_area, 0)::text, nullif(total_area, 0)::text, subdivision,
      'oracle-open-data', 'property:' || pid, 'ipfs://' || property_cid
    from _backbone_staging where pid <> ''
    on conflict do nothing
  `);

  logger.info("backbone_upsert_taxes");
  await db.execute(sql`
    insert into taxes (property_id, property_assessed_value_amount, property_market_value_amount,
      property_land_amount, source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${NS}::uuid, 'property:' || pid),
      assessed_value::numeric, market_value::numeric, land_value::numeric,
      'oracle-open-data', 'tax:' || pid || ':current', 'ipfs://' || property_cid
    from _backbone_staging where pid <> '' and (assessed_value is not null or market_value is not null)
    on conflict do nothing
  `);

  logger.info("backbone_upsert_ownerships");
  await db.execute(sql`
    insert into ownerships (property_id, owned_by, owner_occupied_indicator,
      source_system, source_record_key, source_artifact_uri)
    select uuid_generate_v5(${NS}::uuid, 'property:' || pid), owner_name, owner_occupied,
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

  await pool.end();
  logger.info({ properties: Number((total.rows[0] as { n: number }).n) }, "backbone_complete");
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "backbone_failed");
  process.exit(1);
});
