import { sql, type SQL } from "drizzle-orm";

import { getDb } from "../db.js";
import { offset, whereAnd, type Filters } from "../filters.js";

// Business view over Sunbiz business_registrations. Unlike the tenant view (which is
// scoped to registrations that occupy a property), this lists every registration and,
// per business, surfaces officers (ownership), registered + occupied addresses, the
// properties it occupies, and permits on those properties.

// Inline predicates off the shared grammar (filters.ts is not editable here).
function businessPredicates(f: Filters): (SQL | null)[] {
  return [
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

export type BusinessListRow = {
  business_registration_id: string;
  entity_name: string | null;
  status: string | null;
  filing_type: string | null;
  document_number: string;
  location_count: number;
  source_url: string | null;
};

export type BusinessCore = {
  business_registration_id: string;
  entity_name: string | null;
  document_number: string;
  status: string | null;
  filing_type: string | null;
  filed_date: string | null;
  fei_number: string | null;
  last_transaction_date: string | null;
  source_system: string | null;
  source_url: string | null;
};

export type BusinessOfficerRow = {
  name: string;
  title: string | null;
  party_role: string;
  source_system: string | null;
  source_url: string | null;
};

export type BusinessAddressRow = {
  address_role: string;
  line_1: string | null;
  line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source_system: string | null;
  source_url: string | null;
};

export type BusinessPropertyRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  county_name: string | null;
  occupancy_type: string;
  source_system: string | null;
  source_url: string | null;
};

export type BusinessPermitRow = {
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

export type BusinessDetail = BusinessCore & {
  officers: BusinessOfficerRow[];
  addresses: BusinessAddressRow[];
  relatedProperties: BusinessPropertyRow[];
  permits: BusinessPermitRow[];
};

export async function listBusinesses(
  f: Filters
): Promise<{ rows: BusinessListRow[]; total: number }> {
  const db = getDb();
  const where = whereAnd(businessPredicates(f));
  const rows = await db.execute(sql`
    select br.business_registration_id, br.entity_name, br.status, br.filing_type, br.document_number,
      (select count(distinct o.property_id)::int from occupancies o
        where o.business_registration_id = br.business_registration_id and o.property_id is not null) as location_count,
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
    rows: rows.rows as BusinessListRow[],
    total: Number((totalRes.rows[0] as { n: number }).n),
  };
}

export async function getBusiness(businessRegistrationId: string): Promise<BusinessDetail | null> {
  const db = getDb();
  const core = await db.execute(sql`
    select br.business_registration_id, br.entity_name, br.document_number, br.status,
      br.filing_type, br.filed_date, br.fei_number, br.last_transaction_date,
      br.source_system, br.source_artifact_uri as source_url
    from business_registrations br
    where br.business_registration_id = ${businessRegistrationId}
  `);
  if (core.rows.length === 0) return null;

  const [officers, addresses, relatedProperties, permits] = await Promise.all([
    // Ownership information: registered officers from the Sunbiz filing.
    db.execute(sql`select name, title, party_role, source_system, source_artifact_uri as source_url
      from business_registration_parties
      where business_registration_id = ${businessRegistrationId} and party_role = 'OFFICER'
      order by officer_ordinal nulls last`),
    // Locations: the addresses carried on the registration (principal, mailing, ...).
    db.execute(sql`select address_role, line_1, line_2, city, state, zip, source_system, source_artifact_uri as source_url
      from business_registration_addresses
      where business_registration_id = ${businessRegistrationId}
      order by address_role`),
    // Related properties: the properties this business is inferred to occupy.
    db.execute(sql`select distinct p.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, pc.county_name,
        o.occupancy_type, o.source_system, o.source_artifact_uri as source_url
      from occupancies o
      join properties p on p.property_id = o.property_id
      join addresses a on a.address_id = p.address_id
      join parcels pc on pc.parcel_id = p.parcel_id
      where o.business_registration_id = ${businessRegistrationId}`),
    // Related permits/projects: permits on the occupied properties.
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
    ...(core.rows[0] as BusinessCore),
    officers: officers.rows as BusinessOfficerRow[],
    addresses: addresses.rows as BusinessAddressRow[],
    relatedProperties: relatedProperties.rows as BusinessPropertyRow[],
    permits: permits.rows as BusinessPermitRow[],
  };
}
