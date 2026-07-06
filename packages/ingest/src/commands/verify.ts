import type { Database } from "@oracle/db";
import { logger } from "@oracle/shared";
import { sql } from "drizzle-orm";

// Coverage verification — the anti-toy-data proof. The canonical property is the
// parcel: the query table has 511,695 property *records* across 480,844 distinct
// parcels (condos/units share a parcel), and `parcel_identifier` is the only key
// that reconciles the enriched IPFS records with the backbone, so the platform
// models 480,844 canonical parcel-properties. Permits/Sunbiz/BBB live entirely
// in the enriched subset. Thresholds are the deterministic backbone counts plus
// scale floors for the dedup-dependent enriched tables; every profile view must
// return rows. Throws on any shortfall.
const EXPECTED = {
  properties: 480844,
  permitsMin: 170000,
  propertiesWithPermitsMin: 20000,
  propertiesWithSunbizMin: 41000,
  distinctOwnersMin: 410000,
  bbbProfilesMin: 100,
} as const;

async function scalar(db: Database, query: ReturnType<typeof sql>): Promise<number> {
  const res = await db.execute(query);
  return Number(Object.values(res.rows[0] ?? {})[0] ?? 0);
}

export async function runVerify(db: Database): Promise<void> {
  const counts = {
    parcels: await scalar(db, sql`select count(*) from parcels`),
    properties: await scalar(db, sql`select count(*) from properties`),
    permits: await scalar(db, sql`select count(*) from property_improvements`),
    propertiesWithPermits: await scalar(
      db,
      sql`select count(distinct property_id) from property_improvements`
    ),
    propertiesWithSunbiz: await scalar(db, sql`select count(distinct property_id) from occupancies`),
    bbbProfiles: await scalar(db, sql`select count(*) from business_reputation_profiles`),
    reviews: await scalar(db, sql`select count(*) from business_reputation_reviews`),
    complaints: await scalar(db, sql`select count(*) from business_reputation_complaints`),
    qualityScores: await scalar(db, sql`select count(*) from contractor_quality_scores`),
    distinctOwners: await scalar(db, sql`select count(distinct owned_by) from ownerships`),
    propertyProfileView: await scalar(db, sql`select count(*) from property_profile_view`),
    permitSearchView: await scalar(db, sql`select count(*) from permit_search_view`),
    companyProfileView: await scalar(db, sql`select count(*) from company_profile_view`),
    addressProfileView: await scalar(db, sql`select count(*) from address_profile_view`),
  };

  const failures: string[] = [];
  const eq = (name: string, actual: number, expected: number): void => {
    if (actual !== expected) failures.push(`${name}: expected ${expected}, got ${actual}`);
  };
  const atLeast = (name: string, actual: number, min: number): void => {
    if (actual < min) failures.push(`${name}: expected >= ${min}, got ${actual}`);
  };

  eq("properties", counts.properties, EXPECTED.properties);
  eq("properties==parcels", counts.properties, counts.parcels);
  atLeast("permits", counts.permits, EXPECTED.permitsMin);
  atLeast("properties_with_permits", counts.propertiesWithPermits, EXPECTED.propertiesWithPermitsMin);
  atLeast("properties_with_sunbiz", counts.propertiesWithSunbiz, EXPECTED.propertiesWithSunbizMin);
  atLeast("distinct_owners", counts.distinctOwners, EXPECTED.distinctOwnersMin);
  atLeast("bbb_profiles", counts.bbbProfiles, EXPECTED.bbbProfilesMin);
  atLeast("reviews", counts.reviews, 1);
  atLeast("complaints", counts.complaints, 1);
  atLeast("quality_scores", counts.qualityScores, 1);
  for (const [view, n] of [
    ["property_profile_view", counts.propertyProfileView],
    ["permit_search_view", counts.permitSearchView],
    ["company_profile_view", counts.companyProfileView],
    ["address_profile_view", counts.addressProfileView],
  ] as const) {
    if (n === 0) failures.push(`${view} is empty`);
  }

  logger.info({ counts, sourceRecords: 511695 }, "verify_counts");
  if (failures.length > 0) {
    for (const f of failures) logger.error({ check: f }, "verify_failed");
    throw new Error(`verification failed: ${failures.length} check(s)`);
  }
  logger.info("verify_ok");
}
