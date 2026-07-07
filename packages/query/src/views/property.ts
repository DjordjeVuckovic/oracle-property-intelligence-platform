import { sql } from "drizzle-orm";

import { getDb } from "../db.js";
import { offset, propertyPredicates, whereAnd, type Filters } from "../filters.js";

// Analytical reads use the Drizzle `sql` tag + `db.execute` (the query builder
// can't express the pgvector/FTS operators and heavy aggregations used across
// this layer). Every result is cast to an explicit Row type below — nothing is
// returned as `unknown`.

// SQL fragment that tags a permit row with major-renovation categories from the
// improvement type + project description (mirrors packages/ingest derive.ts).
export const renovationCategorySql = sql`(
  select array_remove(array[
    case when lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'roof|reroof|shingle' then 'roofing' end,
    case when lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'electric|wiring|panel|solar' then 'electrical' end,
    case when lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'concrete|foundation|slab|seawall' then 'concrete' end,
    case when lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'structural|addition|framing|demolition|demo' then 'structural' end,
    case when lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'plumb|sewer|water heater|repipe' then 'plumbing' end,
    case when lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'hvac|a/c|air condition|condenser|heat pump|mechanical|furnace' then 'hvac' end
  ], null))`;

export type PropertyListRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  property_type: string | null;
  built_year: number | null;
  owner: string | null;
  permit_count: number;
  open_permits: number;
  source_url: string | null;
};

export type PropertyCore = {
  property_id: string;
  parcel_identifier: string;
  property_type: string | null;
  property_usage_type: string | null;
  built_year: number | null;
  subdivision: string | null;
  zoning: string | null;
  legal_description: string | null;
  source_url: string | null;
  source_system: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: string | null;
  longitude: string | null;
  county_name: string | null;
  parcel_id: string;
};

export type OwnershipRow = {
  owned_by: string | null;
  ownership_percentage: string | null;
  owner_occupied_indicator: boolean | null;
  date_acquired: string | null;
  date_sold: string | null;
  source_system: string | null;
};

export type TaxRow = {
  tax_year: number | null;
  property_assessed_value_amount: string | null;
  property_market_value_amount: string | null;
  property_land_amount: string | null;
  yearly_tax_amount: string | null;
};

export type PermitRow = {
  property_improvement_id: string;
  permit_number: string | null;
  improvement_type: string | null;
  improvement_status: string | null;
  record_status: string | null;
  completion_date: string | null;
  estimated_job_value: string | null;
  project_description: string | null;
  source_url: string | null;
  contractor_name: string | null;
  renovation_categories: string[] | null;
};

export type OccupancyRow = {
  business_registration_id: string;
  entity_name: string | null;
  status: string | null;
  filing_type: string | null;
  filed_date: string | null;
  source_system: string | null;
};

export type ContractorActivityRow = {
  company_id: string;
  name: string | null;
  bbb_rating: string | null;
  profile_url: string | null;
  score_band: string | null;
};

export type PropertyDetail = PropertyCore & {
  ownership: OwnershipRow[];
  taxes: TaxRow[];
  permits: PermitRow[];
  openPermits: PermitRow[];
  majorImprovements: PermitRow[];
  occupancy: OccupancyRow[];
  contractors: ContractorActivityRow[];
};

export async function listProperties(
  f: Filters
): Promise<{ rows: PropertyListRow[]; total: number }> {
  const db = getDb();
  const where = whereAnd(propertyPredicates(f));
  const rows = await db.execute(sql`
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      p.property_type, p.property_structure_built_year as built_year,
      (select owned_by from ownerships o where o.property_id = p.property_id limit 1) as owner,
      (select count(*)::int from property_improvements pi where pi.property_id = p.property_id) as permit_count,
      (select count(*)::int from property_improvements pi where pi.property_id = p.property_id and pi.improvement_status = 'open') as open_permits,
      p.source_artifact_uri as source_url
    from properties p
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${where}
    order by p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  const totalRes = await db.execute(sql`
    select count(*)::int as n from properties p
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${where}
  `);
  const total = totalRes.rows[0] as { n: number } | undefined;
  return { rows: rows.rows as PropertyListRow[], total: Number(total?.n ?? 0) };
}

export async function getProperty(propertyId: string): Promise<PropertyDetail | null> {
  const db = getDb();
  const core = await db.execute(sql`
    select p.property_id, p.parcel_identifier, p.property_type, p.property_usage_type,
      p.property_structure_built_year as built_year, p.subdivision, p.zoning,
      p.property_legal_description_text as legal_description, p.source_artifact_uri as source_url,
      p.source_system, a.unnormalized_address as address, a.city_name as city,
      a.state_code as state, a.postal_code as zip, a.latitude, a.longitude,
      pc.county_name, pc.parcel_id
    from properties p
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    where p.property_id = ${propertyId}
  `);
  const coreRow = core.rows[0] as PropertyCore | undefined;
  if (coreRow === undefined) return null;

  const [ownership, taxes, permits, occupancy, contractors] = await Promise.all([
    db.execute(sql`select distinct owned_by, ownership_percentage, owner_occupied_indicator, date_acquired, date_sold, source_system
      from ownerships where property_id = ${propertyId} order by date_acquired desc nulls last`),
    db.execute(sql`select tax_year, property_assessed_value_amount, property_market_value_amount, property_land_amount, yearly_tax_amount
      from taxes where property_id = ${propertyId} order by tax_year desc nulls last limit 12`),
    db.execute(sql`select pi.property_improvement_id, pi.permit_number, pi.improvement_type, pi.improvement_status,
        pi.record_status, pi.completion_date, pi.estimated_job_value, pi.project_description, pi.source_url,
        c.name as contractor_name, ${renovationCategorySql} as renovation_categories
      from property_improvements pi
      left join companies c on c.company_id = pi.contractor_company_id
      where pi.property_id = ${propertyId} order by pi.completion_date desc nulls last`),
    db.execute(sql`select br.business_registration_id, br.entity_name, br.status, br.filing_type, br.filed_date, o.source_system
      from occupancies o join business_registrations br on br.business_registration_id = o.business_registration_id
      where o.property_id = ${propertyId}`),
    db.execute(sql`select distinct c.company_id, c.name, brp.bbb_rating, brp.profile_url, cqs.score_band
      from property_improvements pi
      join companies c on c.company_id = pi.contractor_company_id
      left join business_reputation_profiles brp on brp.company_id = c.company_id
      left join contractor_quality_scores cqs on cqs.company_id = c.company_id
      where pi.property_id = ${propertyId} and c.name is not null`),
  ]);

  const permitRows = permits.rows as PermitRow[];
  return {
    ...coreRow,
    ownership: ownership.rows as OwnershipRow[],
    taxes: taxes.rows as TaxRow[],
    permits: permitRows,
    openPermits: permitRows.filter((p) => p.improvement_status === "open"),
    majorImprovements: permitRows.filter((p) => (p.renovation_categories?.length ?? 0) > 0),
    occupancy: occupancy.rows as OccupancyRow[],
    contractors: contractors.rows as ContractorActivityRow[],
  };
}
