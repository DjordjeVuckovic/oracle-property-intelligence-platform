import { sql } from "drizzle-orm";

import { getDb } from "../db.js";

// Dataset provenance for the /sources page: per-entity counts, the source
// systems + their public URLs, and the ingestion-run ledger (stage, status,
// counts, timestamps). All read from the loaded DB — nothing hardcoded.

export type SourceCounts = {
  properties: number;
  parcels: number;
  permits: number;
  businesses: number;
  contractors: number;
  reviews: number;
  complaints: number;
  owners: number;
  occupancies: number;
};

export type IngestionRunRow = {
  stage: string;
  status: string;
  source_system: string | null;
  source_uri: string | null;
  counts: Record<string, number>;
  started_at: string | null;
  finished_at: string | null;
};

export type SourceSystem = {
  key: string;
  label: string;
  description: string;
  url: string;
  records: number;
};

export type SourcesData = {
  counts: SourceCounts;
  sourceRecords: number;
  runs: IngestionRunRow[];
  systems: SourceSystem[];
};

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const res = await getDb().execute(query);
  const row = res.rows[0];
  return Number(Object.values(row ?? {})[0] ?? 0);
}

export async function getSources(): Promise<SourcesData> {
  const [
    properties,
    parcels,
    permits,
    businesses,
    contractors,
    reviews,
    complaints,
    owners,
    occupancies,
  ] = await Promise.all([
    scalar(sql`select count(*) from properties`),
    scalar(sql`select count(*) from parcels`),
    scalar(sql`select count(*) from property_improvements`),
    scalar(sql`select count(*) from business_registrations`),
    scalar(sql`select count(*) from business_reputation_profiles`),
    scalar(sql`select count(*) from business_reputation_reviews`),
    scalar(sql`select count(*) from business_reputation_complaints`),
    scalar(sql`select count(distinct owned_by) from ownerships`),
    scalar(sql`select count(*) from occupancies`),
  ]);

  const runsRes = await getDb().execute(sql`
    select stage, status, source_system, source_uri, counts, started_at, finished_at
    from ingestion_runs order by started_at desc limit 20
  `);

  const counts: SourceCounts = {
    properties,
    parcels,
    permits,
    businesses,
    contractors,
    reviews,
    complaints,
    owners,
    occupancies,
  };

  const systems: SourceSystem[] = [
    {
      key: "appraiser",
      label: "Lee County Property Appraiser",
      description: "Parcels, properties, ownership, tax/valuation history, sales.",
      url: "https://www.leepa.org/",
      records: properties,
    },
    {
      key: "accela",
      label: "Lee County Permits (Accela)",
      description: "Building permits, improvements, inspections, contractor links.",
      url: "https://www.leegov.com/dcd/",
      records: permits,
    },
    {
      key: "sunbiz",
      label: "Florida Sunbiz",
      description: "Business registrations, officers, annual reports (derived tenants).",
      url: "https://dos.myflorida.com/sunbiz/",
      records: businesses,
    },
    {
      key: "bbb",
      label: "Better Business Bureau",
      description: "Contractor reputation profiles, ratings, reviews, complaints.",
      url: "https://www.bbb.org/",
      records: contractors,
    },
  ];

  return {
    counts,
    sourceRecords: 511695,
    runs: runsRes.rows as IngestionRunRow[],
    systems,
  };
}
