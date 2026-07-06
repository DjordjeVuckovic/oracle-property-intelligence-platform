import { schema } from "@oracle/db";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { RowSets } from "./map-record.js";

// FK-safe load order: address/parcel/company hubs → properties → their children →
// permits + permit children → registrations + children → reputation + children →
// occupancies. Every table a `mapRecord` row set targets appears exactly once.
export const TABLE_ORDER: (keyof RowSets)[] = [
  "addresses",
  "parcels",
  "companies",
  "properties",
  "ownerships",
  "taxes",
  "salesHistories",
  "deeds",
  "propertyImprovements",
  "inspections",
  "permitContacts",
  "permitLinks",
  "businessRegistrations",
  "businessRegistrationParties",
  "businessRegistrationAnnualReports",
  "businessRegistrationAddresses",
  "businessReputationProfiles",
  "businessReputationReviews",
  "businessReputationComplaints",
  "contractorQualityScores",
  "occupancies",
];

export function tableFor(rowKey: keyof RowSets): PgTable {
  return schema[rowKey as keyof typeof schema] as PgTable;
}

export function sqlTableName(rowKey: keyof RowSets): string {
  return getTableName(tableFor(rowKey));
}

// Map a Drizzle insert row (camelCase JS keys) to its physical column names
// (snake_case) so the staged parquet columns line up 1:1 with the Postgres table
// and the bulk loader can address them by name. Undefined values are dropped.
export function toDbRow(rowKey: keyof RowSets, row: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(tableFor(rowKey));
  const out: Record<string, unknown> = {};
  for (const [jsKey, value] of Object.entries(row)) {
    const column = columns[jsKey];
    if (column === undefined || value === undefined) continue;
    out[column.name] = value;
  }
  return out;
}
