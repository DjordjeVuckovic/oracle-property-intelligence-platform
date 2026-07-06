import type { Database } from "@oracle/db";
import { schema } from "@oracle/db";
import type { PgTable } from "drizzle-orm/pg-core";

import { emptyRowSets, type RowSets } from "./map-record.js";

// Insert order respects foreign keys: hubs (address/parcel/company) before
// properties, properties before their children, permits before permit children,
// registrations/profiles before theirs.
const INSERT_ORDER: { key: keyof RowSets; table: PgTable; pk?: string }[] = [
  { key: "addresses", table: schema.addresses, pk: "addressId" },
  { key: "parcels", table: schema.parcels, pk: "parcelId" },
  { key: "companies", table: schema.companies, pk: "companyId" },
  { key: "properties", table: schema.properties, pk: "propertyId" },
  { key: "ownerships", table: schema.ownerships },
  { key: "taxes", table: schema.taxes },
  { key: "salesHistories", table: schema.salesHistories },
  { key: "deeds", table: schema.deeds },
  { key: "propertyImprovements", table: schema.propertyImprovements, pk: "propertyImprovementId" },
  { key: "inspections", table: schema.inspections },
  { key: "permitEvents", table: schema.permitEvents },
  { key: "permitFees", table: schema.permitFees },
  { key: "permitContacts", table: schema.permitContacts },
  { key: "permitLinks", table: schema.permitLinks },
  { key: "businessRegistrations", table: schema.businessRegistrations, pk: "businessRegistrationId" },
  { key: "businessRegistrationParties", table: schema.businessRegistrationParties },
  { key: "businessRegistrationAnnualReports", table: schema.businessRegistrationAnnualReports },
  { key: "businessRegistrationAddresses", table: schema.businessRegistrationAddresses },
  { key: "businessReputationProfiles", table: schema.businessReputationProfiles, pk: "businessReputationProfileId" },
  { key: "businessReputationReviews", table: schema.businessReputationReviews },
  { key: "businessReputationComplaints", table: schema.businessReputationComplaints },
  { key: "contractorQualityScores", table: schema.contractorQualityScores },
  { key: "occupancies", table: schema.occupancies, pk: "occupancyId" },
];

// Keep each INSERT well under Postgres' 65535-bind-parameter ceiling. Wide rows
// (~40 cols) → 500 rows ≈ 20k params, comfortably safe.
const CHUNK = 500;

function dedupeByPk<T extends Record<string, unknown>>(rows: T[], pk: string): T[] {
  const seen = new Map<unknown, T>();
  for (const row of rows) seen.set(row[pk], row);
  return [...seen.values()];
}

// Insert one accumulated batch. First-write-wins via ON CONFLICT DO NOTHING, so
// reruns are no-ops and shared hubs (a contractor referenced by 1000 permits)
// collapse to one row. Hub tables are deduped by PK within the batch first
// because a single multi-row INSERT cannot touch the same conflict key twice.
export async function flushBatch(db: Database, rows: RowSets): Promise<void> {
  for (const { key, table, pk } of INSERT_ORDER) {
    let values = rows[key] as Record<string, unknown>[];
    if (values.length === 0) continue;
    if (pk) values = dedupeByPk(values, pk);
    for (let i = 0; i < values.length; i += CHUNK) {
      const chunk = values.slice(i, i + CHUNK);
      await db.insert(table).values(chunk).onConflictDoNothing();
    }
  }
}

// Accumulator that flushes to the DB every `recordsPerFlush` records mapped.
export class BatchLoader {
  private rows: RowSets = emptyRowSets();
  private pending = 0;
  private readonly counts: Record<string, number> = {};

  constructor(
    private readonly db: Database,
    private readonly recordsPerFlush: number
  ) {}

  add(rows: RowSets): void {
    for (const key of Object.keys(rows) as (keyof RowSets)[]) {
      const arr = this.rows[key] as unknown[];
      arr.push(...(rows[key] as unknown[]));
    }
    this.pending += 1;
  }

  async maybeFlush(): Promise<void> {
    if (this.pending >= this.recordsPerFlush) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.pending === 0) return;
    for (const key of Object.keys(this.rows) as (keyof RowSets)[]) {
      this.counts[key] = (this.counts[key] ?? 0) + (this.rows[key] as unknown[]).length;
    }
    await flushBatch(this.db, this.rows);
    this.rows = emptyRowSets();
    this.pending = 0;
  }

  totals(): Record<string, number> {
    return { ...this.counts };
  }
}
