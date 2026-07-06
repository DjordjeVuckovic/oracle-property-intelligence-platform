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
// Scale floors, deliberately well below the current parcel-keyed counts so the
// check proves "real data at scale, not a toy sample" without breaking when a
// future Oracle export adds parcels/properties. No exact magic numbers — only
// floors, structural invariants (properties == parcels), and non-empty views.
// Current reference (Lee County, 2026-06-25 export): 480,844 properties,
// 112,431 permits, 20,459 permit-properties, 41,651 sunbiz-properties, 388,311
// owners, 870 BBB profiles.
const FLOORS = {
  properties: 400000,
  permits: 90000,
  propertiesWithPermits: 18000,
  propertiesWithSunbiz: 38000,
  distinctOwners: 350000,
  bbbProfiles: 200,
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
    propertiesWithSunbiz: await scalar(
      db,
      sql`select count(distinct property_id) from occupancies`
    ),
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
  const atLeast = (name: string, actual: number, min: number): void => {
    if (actual < min) failures.push(`${name}: expected >= ${min}, got ${actual}`);
  };

  // Structural invariant (robust to dataset growth): one canonical property per
  // parcel, so the two counts always match regardless of scale.
  if (counts.properties !== counts.parcels) {
    failures.push(`properties (${counts.properties}) != parcels (${counts.parcels})`);
  }
  // Scale floors — prove real data, never assert an exact size.
  atLeast("properties", counts.properties, FLOORS.properties);
  atLeast("permits", counts.permits, FLOORS.permits);
  atLeast("properties_with_permits", counts.propertiesWithPermits, FLOORS.propertiesWithPermits);
  atLeast("properties_with_sunbiz", counts.propertiesWithSunbiz, FLOORS.propertiesWithSunbiz);
  atLeast("distinct_owners", counts.distinctOwners, FLOORS.distinctOwners);
  atLeast("bbb_profiles", counts.bbbProfiles, FLOORS.bbbProfiles);
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
