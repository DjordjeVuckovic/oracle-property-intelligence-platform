import { sql, type SQL } from "drizzle-orm";

import { getDb } from "../db.js";
import { offset, whereAnd, type Filters } from "../filters.js";

// A "tenant" is DERIVED, not stored upstream: a Sunbiz business_registration that
// appears in the occupancies table (registered at a property's address) is treated
// as an occupant. This view lists those registrations and, per tenant, surfaces the
// occupied properties, the registration's officers, and permits on those properties.
// Occupancy is inferred — the UI must say so rather than promise residential tenants.

// Predicates for the tenant list. The base predicate restricts to registrations that
// actually occupy a property (semi-join, naturally distinct); the rest are optional
// filters off the shared grammar. Kept inline because filters.ts is not editable here.
function tenantPredicates(f: Filters): (SQL | null)[] {
  return [
    sql`exists (select 1 from occupancies o where o.business_registration_id = br.business_registration_id)`,
    f.q ? sql`br.entity_name ilike ${"%" + f.q + "%"}` : null,
    f.businessType ? sql`br.filing_type ilike ${"%" + f.businessType + "%"}` : null,
    f.county
      ? sql`exists (select 1 from occupancies o
          join properties p on p.property_id = o.property_id
          join parcels pc on pc.parcel_id = p.parcel_id
          where o.business_registration_id = br.business_registration_id and pc.county_name ilike ${f.county})`
      : null,
    f.municipality
      ? sql`exists (select 1 from occupancies o
          join properties p on p.property_id = o.property_id
          join addresses a on a.address_id = p.address_id
          where o.business_registration_id = br.business_registration_id and a.city_name ilike ${f.municipality})`
      : null,
  ];
}

export type TenantListRow = {
  business_registration_id: string;
  entity_name: string | null;
  status: string | null;
  filing_type: string | null;
  occupancy_count: number;
  source_url: string | null;
};

export type TenantCore = {
  business_registration_id: string;
  entity_name: string | null;
  status: string | null;
  filing_type: string | null;
  filed_date: string | null;
  document_number: string;
  fei_number: string | null;
  source_system: string | null;
  source_url: string | null;
};

export type TenantOccupancyRow = {
  occupancy_id: string;
  property_id: string | null;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  county_name: string | null;
  occupancy_type: string;
  start_date: string | null;
  end_date: string | null;
  source_system: string | null;
  source_url: string | null;
};

export type TenantPropertyRelationRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  relationship: string;
};

export type TenantOfficerRow = {
  name: string;
  title: string | null;
  party_role: string;
  source_system: string | null;
  source_url: string | null;
};

export type TenantPermitRow = {
  property_improvement_id: string;
  property_id: string | null;
  permit_number: string | null;
  improvement_type: string | null;
  improvement_status: string | null;
  completion_date: string | null;
  project_description: string | null;
  source_url: string | null;
  parcel_identifier: string;
};

export type TenantDetail = TenantCore & {
  occupancyHistory: TenantOccupancyRow[];
  relationships: TenantPropertyRelationRow[];
  officers: TenantOfficerRow[];
  permits: TenantPermitRow[];
};

export async function listTenants(f: Filters): Promise<{ rows: TenantListRow[]; total: number }> {
  const db = getDb();
  const where = whereAnd(tenantPredicates(f));
  const rows = await db.execute(sql`
    select br.business_registration_id, br.entity_name, br.status, br.filing_type,
      (select count(*)::int from occupancies o where o.business_registration_id = br.business_registration_id) as occupancy_count,
      br.source_artifact_uri as source_url
    from business_registrations br
    ${where}
    order by br.entity_name nulls last
    limit ${f.pageSize} offset ${offset(f)}
  `);
  const totalRes = await db.execute(sql`
    select count(*)::int as n from business_registrations br
    ${where}
  `);
  return {
    rows: rows.rows as TenantListRow[],
    total: Number((totalRes.rows[0] as { n: number }).n),
  };
}

export async function getTenant(businessRegistrationId: string): Promise<TenantDetail | null> {
  const db = getDb();
  const core = await db.execute(sql`
    select br.business_registration_id, br.entity_name, br.status, br.filing_type,
      br.filed_date, br.document_number, br.fei_number,
      br.source_system, br.source_artifact_uri as source_url
    from business_registrations br
    where br.business_registration_id = ${businessRegistrationId}
  `);
  if (core.rows.length === 0) return null;

  const [occupancyHistory, relationships, officers, permits] = await Promise.all([
    // Occupancy history: every occupied property with its address and occupancy window.
    db.execute(sql`select o.occupancy_id, o.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, pc.county_name,
        o.occupancy_type, o.start_date, o.end_date, o.source_system, o.source_artifact_uri as source_url
      from occupancies o
      join properties p on p.property_id = o.property_id
      join addresses a on a.address_id = p.address_id
      join parcels pc on pc.parcel_id = p.parcel_id
      where o.business_registration_id = ${businessRegistrationId}
      order by o.start_date desc nulls last`),
    // Tenant-to-property relationships: distinct properties this tenant occupies.
    db.execute(sql`select distinct p.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, 'occupies'::text as relationship
      from occupancies o
      join properties p on p.property_id = o.property_id
      join addresses a on a.address_id = p.address_id
      where o.business_registration_id = ${businessRegistrationId}`),
    // Tenant-associated businesses: the registration's officers (from Sunbiz parties).
    db.execute(sql`select name, title, party_role, source_system, source_artifact_uri as source_url
      from business_registration_parties
      where business_registration_id = ${businessRegistrationId} and party_role = 'OFFICER'
      order by officer_ordinal nulls last`),
    // Tenant-associated permits/projects: permits on the occupied properties.
    db.execute(sql`select pi.property_improvement_id, pi.property_id, pi.permit_number,
        pi.improvement_type, pi.improvement_status, pi.completion_date, pi.project_description,
        pi.source_url, p.parcel_identifier
      from property_improvements pi
      join properties p on p.property_id = pi.property_id
      where pi.property_id in (
        select property_id from occupancies where business_registration_id = ${businessRegistrationId} and property_id is not null
      )
      order by pi.completion_date desc nulls last`),
  ]);

  return {
    ...(core.rows[0] as TenantCore),
    occupancyHistory: occupancyHistory.rows as TenantOccupancyRow[],
    relationships: relationships.rows as TenantPropertyRelationRow[],
    officers: officers.rows as TenantOfficerRow[],
    permits: permits.rows as TenantPermitRow[],
  };
}
