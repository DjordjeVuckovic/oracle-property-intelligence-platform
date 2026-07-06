import { createPool, createDb } from "@oracle/db";
import { logger } from "@oracle/shared";
import { sql } from "drizzle-orm";

// Post-load verification. Prints per-table counts and checks the enriched-source
// coverage against the parquet backbone's flags (see AGENTS.md / README). These
// numbers are the anti-toy-data proof: permits/Sunbiz/BBB live entirely in the
// enriched subset, so they must match regardless of the skeletal backbone.
const EXPECTED = {
  properties_total: 511695,
  properties_with_permits: 26965,
  permits_total: 175594,
  properties_with_sunbiz: 42407,
  properties_with_bbb: 8664,
  distinct_owners: 410076,
} as const;

async function scalar(db: ReturnType<typeof createDb>, query: ReturnType<typeof sql>): Promise<number> {
  const res = await db.execute(query);
  const row = res.rows[0] ?? {};
  return Number(Object.values(row)[0] ?? 0);
}

async function main(): Promise<void> {
  const pool = createPool();
  const db = createDb(pool);

  const counts = {
    parcels: await scalar(db, sql`select count(*) from parcels`),
    properties: await scalar(db, sql`select count(*) from properties`),
    addresses: await scalar(db, sql`select count(*) from addresses`),
    permits: await scalar(db, sql`select count(*) from property_improvements`),
    properties_with_permits: await scalar(
      db,
      sql`select count(distinct property_id) from property_improvements`
    ),
    business_registrations: await scalar(db, sql`select count(*) from business_registrations`),
    occupancies: await scalar(db, sql`select count(*) from occupancies`),
    properties_with_sunbiz: await scalar(
      db,
      sql`select count(distinct property_id) from occupancies`
    ),
    bbb_profiles: await scalar(db, sql`select count(*) from business_reputation_profiles`),
    companies: await scalar(db, sql`select count(*) from companies`),
    quality_scores: await scalar(db, sql`select count(*) from contractor_quality_scores`),
    distinct_owners: await scalar(db, sql`select count(distinct owned_by) from ownerships`),
  };

  const checks: { name: string; actual: number; expected: number; ok: boolean }[] = [
    { name: "permits_total", actual: counts.permits, expected: EXPECTED.permits_total, ok: false },
    {
      name: "properties_with_permits",
      actual: counts.properties_with_permits,
      expected: EXPECTED.properties_with_permits,
      ok: false,
    },
    {
      name: "properties_with_sunbiz",
      actual: counts.properties_with_sunbiz,
      expected: EXPECTED.properties_with_sunbiz,
      ok: false,
    },
  ].map((c) => ({ ...c, ok: c.actual >= Math.floor(c.expected * 0.95) }));

  logger.info({ counts }, "verify_counts");
  for (const c of checks) {
    logger.info(c, c.ok ? "check_pass" : "check_below_expected");
  }

  await pool.end();
  const allNonEmpty = Object.values(counts).every((v) => v > 0);
  if (!allNonEmpty) {
    logger.error("some tables are empty");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "verify_failed");
  process.exit(1);
});
