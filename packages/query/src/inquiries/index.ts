import { sql, type SQL } from "drizzle-orm";

import { getDb } from "../db.js";
import { offset, propertyPredicates, whereAnd, type Filters } from "../filters.js";
import type { Citation } from "../provenance.js";
import { renovationCategorySql } from "../views/property.js";

// ---------------------------------------------------------------------------
// Canonical inquiry engine.
//
// Each README "Required Demo Inquiry" is a typed, deterministic function over
// the reconciled Lee County graph. Every inquiry takes the shared Filters,
// paginates with pageSize/offset, and returns rows + a total + one Citation per
// row (entity id, human label, and the row's real source URL for provenance).
//
// Data notes that shape the SQL below:
//   * The Oracle export carries NO permit issue/completion dates on
//     property_improvements (every date column is null). Permit *timing* is
//     recovered from the child inspections table: a permit's effective activity
//     date = max(inspections.completed_date). Inquiries #7 and #19 use this to
//     stay genuinely temporal rather than falling back to volume proxies.
//   * "Ownership change" has no date on ownerships either, so it is derived from
//     the count of sales_histories transactions per property (#17).
//   * "Tenant"/"business turnover" are occupancy-derived (Sunbiz businesses at a
//     property address); labels say so rather than promising residential tenancy.
// ---------------------------------------------------------------------------

// Tunables kept as named constants (mirrors the documented inquiry defaults).
const SIGNIFICANT_RENOVATION_MIN_PERMITS = 3;
const NEIGHBORHOOD_MIN_RECENT_PERMITS = 3;
const VALUE_ADD_MIN_CATEGORIES = 2;

// Rows are always primitive/JSON-safe scalars: counts arrive as ::int (numbers),
// dates are cast ::text, numerics stay strings. This keeps every concrete row
// type assignable to the shared InquiryRow index type.
export type InquiryRow = Record<string, string | number | boolean | null>;

export type InquiryResult<TRow extends InquiryRow = InquiryRow> = {
  rows: TRow[];
  total: number;
  citations: Citation[];
};

export type Inquiry = {
  key: string;
  label: string;
  category: string;
  description: string;
  run: (f: Filters) => Promise<InquiryResult>;
};

// ---------------------------------------------------------------------------
// Execution helpers.
// ---------------------------------------------------------------------------

async function exec<TRow extends InquiryRow>(query: SQL): Promise<TRow[]> {
  const result = await getDb().execute(query);
  return result.rows as TRow[];
}

// Every list query carries `count(*) over()::int as full_count`: the full result
// size before LIMIT (post-GROUP BY it counts groups). Read it off the first row.
function totalOf(rows: InquiryRow[]): number {
  const first = rows[0];
  if (first === undefined) return 0;
  const raw = first.full_count;
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

function finalize<TRow extends InquiryRow>(
  rows: TRow[],
  toCitation: (row: TRow) => Citation
): InquiryResult<TRow> {
  return { rows, total: totalOf(rows), citations: rows.map(toCitation) };
}

function propertyLabel(parcel: string, address: string | null): string {
  return address ? `${parcel} — ${address}` : parcel;
}

// Contractor-name filter fragment (nullable): honored across contractor inquiries.
function contractorNameFilter(f: Filters): SQL | null {
  return f.contractor ? sql`c.name ilike ${"%" + f.contractor + "%"}` : null;
}

// Negative-reputation predicates. They reference the `brp`/`cqs` aliases the
// contractor inquiries expose; the rating set + score bands come straight from
// the AGENTS.md definition of "negative BBB".
const negativeBbbPredicate = sql`(brp.bbb_rating in ('F','D','D-','D+','C-') or cqs.score_band in ('poor','marginal'))`;
const negativeOrComplaintPredicate = sql`(brp.bbb_rating in ('F','D','D-','D+','C-') or brp.complaint_count > 0 or cqs.score_band in ('poor','marginal'))`;

// ---------------------------------------------------------------------------
// Row types (one per inquiry). `type` aliases (not interfaces) so they stay
// assignable to InquiryRow via implicit index signatures.
// ---------------------------------------------------------------------------

export type MultiOpenPermitRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  open_permits: number;
  permit_count: number;
  owner: string | null;
  source_url: string | null;
  full_count: number;
};

export type OpenCategoryPermitRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  matching_open_permits: number;
  source_url: string | null;
  full_count: number;
};

export type MajorWorkRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  matching_permits: number;
  source_url: string | null;
  full_count: number;
};

export type HighestPermitActivityRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  permits_last_5y: number;
  most_recent_activity: string | null;
  source_url: string | null;
  full_count: number;
};

export type SignificantRenovationRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  major_permits: number;
  categories: string | null;
  source_url: string | null;
  full_count: number;
};

export type ContractorWorkRow = {
  company_id: string;
  contractor_name: string | null;
  matching_projects: number;
  bbb_rating: string | null;
  score_band: string | null;
  source_url: string | null;
  full_count: number;
};

export type NegativeBbbContractorRow = {
  company_id: string;
  contractor_name: string | null;
  bbb_rating: string | null;
  score_band: string | null;
  complaint_count: number | null;
  review_count: number | null;
  is_accredited: boolean | null;
  projects: number;
  source_url: string | null;
  full_count: number;
};

export type ComplaintContractorRow = {
  company_id: string;
  contractor_name: string | null;
  bbb_rating: string | null;
  complaint_count: number | null;
  closed_complaints_3y: number | null;
  review_count: number | null;
  projects: number;
  source_url: string | null;
  full_count: number;
};

export type NegativeContractorProjectRow = {
  property_improvement_id: string;
  permit_number: string | null;
  improvement_type: string | null;
  improvement_status: string | null;
  property_id: string | null;
  parcel_identifier: string | null;
  address: string | null;
  contractor_name: string | null;
  bbb_rating: string | null;
  complaint_count: number | null;
  score_band: string | null;
  source_url: string | null;
  full_count: number;
};

export type MultiPropertyBusinessRow = {
  company_id: string;
  business_name: string | null;
  property_count: number;
  status: string | null;
  source_url: string | null;
  full_count: number;
};

export type MultiPropertyOwnerRow = {
  owner_name: string;
  property_count: number;
  source_url: string | null;
  full_count: number;
};

export type MultiLocationTenantRow = {
  tenant_name: string;
  location_count: number;
  address_count: number;
  status: string | null;
  source_url: string | null;
  full_count: number;
};

export type OwnershipChangeActivePermitRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  ownership_changes: number;
  last_sale: string | null;
  open_permits: number;
  source_url: string | null;
  full_count: number;
};

export type ActivePermitTurnoverRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  open_permits: number;
  occupant_count: number;
  distinct_occupants: number;
  source_url: string | null;
  full_count: number;
};

export type IncreasingNeighborhoodRow = {
  neighborhood: string;
  recent_permits: number;
  prior_permits: number;
  activity_increase: number;
  source_url: string | null;
  full_count: number;
};

export type RenovationNeighborhoodRow = {
  neighborhood: string;
  major_renovations: number;
  properties_affected: number;
  source_url: string | null;
  full_count: number;
};

export type MostActiveContractorRow = {
  company_id: string;
  contractor_name: string | null;
  project_count: number;
  bbb_rating: string | null;
  score_band: string | null;
  source_url: string | null;
  full_count: number;
};

export type MostActiveBusinessRow = {
  company_id: string;
  business_name: string | null;
  property_count: number;
  source_url: string | null;
  full_count: number;
};

export type RedevelopmentCandidateRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  demolition_permits: number;
  construction_permits: number;
  source_url: string | null;
  full_count: number;
};

export type ValueAddPropertyRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  distinct_major_categories: number;
  major_permits: number;
  categories: string | null;
  source_url: string | null;
  full_count: number;
};

export type ComplaintProjectContractorRow = {
  company_id: string;
  contractor_name: string | null;
  complaint_count: number | null;
  bbb_rating: string | null;
  complaint_linked_projects: number;
  source_url: string | null;
  full_count: number;
};

// ---------------------------------------------------------------------------
// #1 Properties with more than one open permit.
// ---------------------------------------------------------------------------

async function runMultipleOpenPermits(f: Filters): Promise<InquiryResult<MultiOpenPermitRow>> {
  const rows = await exec<MultiOpenPermitRow>(sql`
    with op as (
      select property_id, count(*)::int as open_permits
      from property_improvements
      where improvement_status = 'open' and property_id is not null
      group by property_id
      having count(*) > 1
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      op.open_permits,
      (select count(*)::int from property_improvements pi2 where pi2.property_id = p.property_id) as permit_count,
      (select owned_by from ownerships o where o.property_id = p.property_id limit 1) as owner,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from op
    join properties p on p.property_id = op.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd(propertyPredicates(f))}
    order by op.open_permits desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #2/#3 Properties with an open permit in a renovation category.
// ---------------------------------------------------------------------------

function makeOpenCategoryInquiry(category: string) {
  return async function runOpenCategory(f: Filters): Promise<InquiryResult<OpenCategoryPermitRow>> {
    const rows = await exec<OpenCategoryPermitRow>(sql`
      with hits as (
        select pi.property_id, count(*)::int as matching_open_permits
        from property_improvements pi
        where pi.improvement_status = 'open' and pi.property_id is not null
          and ${renovationCategorySql} @> array[${category}]
        group by pi.property_id
      )
      select p.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city,
        hits.matching_open_permits,
        p.source_artifact_uri as source_url,
        count(*) over()::int as full_count
      from hits
      join properties p on p.property_id = hits.property_id
      join addresses a on a.address_id = p.address_id
      join parcels pc on pc.parcel_id = p.parcel_id
      ${whereAnd(propertyPredicates(f))}
      order by hits.matching_open_permits desc, p.parcel_identifier
      limit ${f.pageSize} offset ${offset(f)}
    `);
    return finalize(rows, (r) => ({
      entityType: "property",
      entityId: r.property_id,
      label: propertyLabel(r.parcel_identifier, r.address),
      sourceUrl: r.source_url,
    }));
  };
}

// ---------------------------------------------------------------------------
// #4/#5/#6 Properties that underwent major work in a renovation category.
// ---------------------------------------------------------------------------

function makeMajorWorkInquiry(category: string) {
  return async function runMajorWork(f: Filters): Promise<InquiryResult<MajorWorkRow>> {
    const rows = await exec<MajorWorkRow>(sql`
      with hits as (
        select pi.property_id, count(*)::int as matching_permits,
          min(pi.source_url) as sample_permit_url
        from property_improvements pi
        where pi.property_id is not null
          and ${renovationCategorySql} @> array[${category}]
        group by pi.property_id
      )
      select p.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city,
        hits.matching_permits,
        coalesce(p.source_artifact_uri, hits.sample_permit_url) as source_url,
        count(*) over()::int as full_count
      from hits
      join properties p on p.property_id = hits.property_id
      join addresses a on a.address_id = p.address_id
      join parcels pc on pc.parcel_id = p.parcel_id
      ${whereAnd(propertyPredicates(f))}
      order by hits.matching_permits desc, p.parcel_identifier
      limit ${f.pageSize} offset ${offset(f)}
    `);
    return finalize(rows, (r) => ({
      entityType: "property",
      entityId: r.property_id,
      label: propertyLabel(r.parcel_identifier, r.address),
      sourceUrl: r.source_url,
    }));
  };
}

// ---------------------------------------------------------------------------
// #7 Properties with the highest permit activity in the last five years.
// Permit timing derived from max(inspections.completed_date) per permit.
// ---------------------------------------------------------------------------

async function runHighestPermitActivity(
  f: Filters
): Promise<InquiryResult<HighestPermitActivityRow>> {
  const rows = await exec<HighestPermitActivityRow>(sql`
    with permit_activity as (
      select pi.property_id, pi.property_improvement_id, max(i.completed_date) as last_activity
      from property_improvements pi
      join inspections i on i.property_improvement_id = pi.property_improvement_id
      where pi.property_id is not null
      group by pi.property_id, pi.property_improvement_id
    ),
    agg as (
      select property_id,
        count(*)::int as permits_last_5y,
        max(last_activity)::text as most_recent_activity
      from permit_activity
      where last_activity >= current_date - interval '5 years'
      group by property_id
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      agg.permits_last_5y, agg.most_recent_activity,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from agg
    join properties p on p.property_id = agg.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd(propertyPredicates(f))}
    order by agg.permits_last_5y desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #8 Properties with significant renovation activity (>= N major-category permits).
// ---------------------------------------------------------------------------

async function runSignificantRenovation(
  f: Filters
): Promise<InquiryResult<SignificantRenovationRow>> {
  const rows = await exec<SignificantRenovationRow>(sql`
    with major as (
      select pi.property_id, pi.property_improvement_id, ${renovationCategorySql} as cats
      from property_improvements pi
      where pi.property_id is not null and cardinality(${renovationCategorySql}) > 0
    ),
    agg as (
      select m.property_id,
        count(distinct m.property_improvement_id)::int as major_permits,
        string_agg(distinct c, ', ' order by c) as categories
      from major m, unnest(m.cats) as c
      group by m.property_id
      having count(distinct m.property_improvement_id) >= ${SIGNIFICANT_RENOVATION_MIN_PERMITS}
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      agg.major_permits, agg.categories,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from agg
    join properties p on p.property_id = agg.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd(propertyPredicates(f))}
    order by agg.major_permits desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #9/#10 Contractors performing roofing / electrical work in Lee County.
// ---------------------------------------------------------------------------

function makeContractorWorkInquiry(category: string) {
  return async function runContractorWork(f: Filters): Promise<InquiryResult<ContractorWorkRow>> {
    const county = f.county ?? "Lee";
    const rows = await exec<ContractorWorkRow>(sql`
      with hits as (
        select pi.contractor_company_id, count(*)::int as matching_projects
        from property_improvements pi
        join properties p on p.property_id = pi.property_id
        join parcels pc on pc.parcel_id = p.parcel_id
        where pi.contractor_company_id is not null
          and pc.county_name ilike ${county}
          and ${renovationCategorySql} @> array[${category}]
        group by pi.contractor_company_id
      )
      select c.company_id, c.name as contractor_name, hits.matching_projects,
        brp.bbb_rating, cqs.score_band,
        coalesce(brp.profile_url, c.source_artifact_uri) as source_url,
        count(*) over()::int as full_count
      from hits
      join companies c on c.company_id = hits.contractor_company_id
      left join lateral (
        select bbb_rating, profile_url from business_reputation_profiles b
        where b.company_id = c.company_id order by b.updated_at desc nulls last limit 1
      ) brp on true
      left join lateral (
        select score_band from contractor_quality_scores q
        where q.company_id = c.company_id order by q.created_at desc nulls last limit 1
      ) cqs on true
      ${whereAnd([contractorNameFilter(f)])}
      order by hits.matching_projects desc, c.name
      limit ${f.pageSize} offset ${offset(f)}
    `);
    return finalize(rows, (r) => ({
      entityType: "contractor",
      entityId: r.company_id,
      label: r.contractor_name ?? r.company_id,
      sourceUrl: r.source_url,
    }));
  };
}

// ---------------------------------------------------------------------------
// #11 Contractors with negative BBB ratings.
// ---------------------------------------------------------------------------

async function runNegativeBbbContractors(
  f: Filters
): Promise<InquiryResult<NegativeBbbContractorRow>> {
  const rows = await exec<NegativeBbbContractorRow>(sql`
    select c.company_id, c.name as contractor_name,
      brp.bbb_rating, cqs.score_band, brp.complaint_count, brp.review_count, brp.is_accredited,
      (select count(*)::int from property_improvements pi where pi.contractor_company_id = c.company_id) as projects,
      brp.profile_url as source_url,
      count(*) over()::int as full_count
    from companies c
    join lateral (
      select bbb_rating, complaint_count, review_count, is_accredited, profile_url
      from business_reputation_profiles b
      where b.company_id = c.company_id order by b.updated_at desc nulls last limit 1
    ) brp on true
    left join lateral (
      select score_band from contractor_quality_scores q
      where q.company_id = c.company_id order by q.created_at desc nulls last limit 1
    ) cqs on true
    ${whereAnd([contractorNameFilter(f), negativeBbbPredicate])}
    order by projects desc, c.name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "contractor",
    entityId: r.company_id,
    label: r.contractor_name ?? r.company_id,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #12 Contractors with complaint histories.
// ---------------------------------------------------------------------------

async function runComplaintContractors(f: Filters): Promise<InquiryResult<ComplaintContractorRow>> {
  const rows = await exec<ComplaintContractorRow>(sql`
    select c.company_id, c.name as contractor_name,
      brp.bbb_rating, brp.complaint_count, brp.closed_complaints_past_three_years as closed_complaints_3y,
      brp.review_count,
      (select count(*)::int from property_improvements pi where pi.contractor_company_id = c.company_id) as projects,
      brp.profile_url as source_url,
      count(*) over()::int as full_count
    from companies c
    join lateral (
      select bbb_rating, complaint_count, closed_complaints_past_three_years, review_count, profile_url
      from business_reputation_profiles b
      where b.company_id = c.company_id and b.complaint_count > 0
      order by b.complaint_count desc nulls last limit 1
    ) brp on true
    ${whereAnd([contractorNameFilter(f)])}
    order by brp.complaint_count desc, c.name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "contractor",
    entityId: r.company_id,
    label: r.contractor_name ?? r.company_id,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #13 Projects completed by contractors with negative BBB or complaint histories.
// ---------------------------------------------------------------------------

async function runNegativeContractorProjects(
  f: Filters
): Promise<InquiryResult<NegativeContractorProjectRow>> {
  const permitTypeFilter = f.permitType
    ? sql`pi.improvement_type ilike ${"%" + f.permitType + "%"}`
    : null;
  const rows = await exec<NegativeContractorProjectRow>(sql`
    select pi.property_improvement_id, pi.permit_number, pi.improvement_type, pi.improvement_status,
      p.property_id, p.parcel_identifier, a.unnormalized_address as address,
      c.name as contractor_name, brp.bbb_rating, brp.complaint_count, cqs.score_band,
      coalesce(
        case when pi.source_url ~ '^(https?|ipfs)' then pi.source_url end,
        p.source_artifact_uri, brp.profile_url
      ) as source_url,
      count(*) over()::int as full_count
    from property_improvements pi
    join companies c on c.company_id = pi.contractor_company_id
    join lateral (
      select bbb_rating, complaint_count, profile_url from business_reputation_profiles b
      where b.company_id = c.company_id order by b.updated_at desc nulls last limit 1
    ) brp on true
    left join lateral (
      select score_band from contractor_quality_scores q
      where q.company_id = c.company_id order by q.created_at desc nulls last limit 1
    ) cqs on true
    left join properties p on p.property_id = pi.property_id
    left join addresses a on a.address_id = p.address_id
    ${whereAnd([sql`pi.contractor_company_id is not null`, contractorNameFilter(f), permitTypeFilter, negativeOrComplaintPredicate])}
    order by brp.complaint_count desc nulls last, c.name, pi.permit_number
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "permit",
    entityId: r.property_improvement_id,
    label: `${r.permit_number ?? r.improvement_type ?? "permit"}${r.contractor_name ? " — " + r.contractor_name : ""}`,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #14 Businesses operating across multiple properties.
// ---------------------------------------------------------------------------

async function runBusinessesMultipleProperties(
  f: Filters
): Promise<InquiryResult<MultiPropertyBusinessRow>> {
  const businessTypeFilter = f.businessType
    ? sql`exists (select 1 from business_registrations br where br.company_id = c.company_id and br.filing_type ilike ${"%" + f.businessType + "%"})`
    : null;
  const rows = await exec<MultiPropertyBusinessRow>(sql`
    with biz as (
      select o.company_id, count(distinct o.property_id)::int as property_count
      from occupancies o
      where o.company_id is not null
      group by o.company_id
      having count(distinct o.property_id) > 1
    )
    select c.company_id, c.name as business_name, biz.property_count,
      br.status,
      c.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from biz
    join companies c on c.company_id = biz.company_id
    left join lateral (
      select status from business_registrations br0
      where br0.company_id = c.company_id order by br0.updated_at desc nulls last limit 1
    ) br on true
    ${whereAnd([businessTypeFilter])}
    order by biz.property_count desc, c.name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "business",
    entityId: r.company_id,
    label: r.business_name ?? r.company_id,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #15 Owners associated with multiple properties.
// ---------------------------------------------------------------------------

async function runOwnersMultipleProperties(
  f: Filters
): Promise<InquiryResult<MultiPropertyOwnerRow>> {
  const rows = await exec<MultiPropertyOwnerRow>(sql`
    with own as (
      select owned_by, count(distinct property_id)::int as property_count,
        min(source_artifact_uri) as sample_url
      from ownerships
      where owned_by is not null and owned_by <> ''
      group by owned_by
      having count(distinct property_id) > 1
    )
    select owned_by as owner_name, property_count, sample_url as source_url,
      count(*) over()::int as full_count
    from own
    order by property_count desc, owned_by
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "owner",
    entityId: r.owner_name,
    label: r.owner_name,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #16 Tenants operating across multiple locations (Sunbiz business occupants).
// ---------------------------------------------------------------------------

async function runTenantsMultipleLocations(
  f: Filters
): Promise<InquiryResult<MultiLocationTenantRow>> {
  const rows = await exec<MultiLocationTenantRow>(sql`
    with t as (
      select br.entity_name,
        count(distinct o.property_id)::int as location_count,
        count(distinct o.normalized_address_key)::int as address_count,
        min(br.status) as status,
        min(br.source_artifact_uri) as sample_url
      from occupancies o
      join business_registrations br on br.business_registration_id = o.business_registration_id
      where br.entity_name is not null
      group by br.entity_name
      having count(distinct o.property_id) > 1
    )
    select entity_name as tenant_name, location_count, address_count, status, sample_url as source_url,
      count(*) over()::int as full_count
    from t
    order by location_count desc, entity_name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "tenant",
    entityId: r.tenant_name,
    label: r.tenant_name,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #17 Properties with both ownership changes and active permit activity.
// ---------------------------------------------------------------------------

async function runOwnershipChangeActivePermits(
  f: Filters
): Promise<InquiryResult<OwnershipChangeActivePermitRow>> {
  const rows = await exec<OwnershipChangeActivePermitRow>(sql`
    with sales as (
      select property_id, count(*)::int as ownership_changes,
        max(ownership_transfer_date)::text as last_sale
      from sales_histories
      where property_id is not null
      group by property_id
      having count(*) > 1
    ),
    op as (
      select property_id, count(*)::int as open_permits
      from property_improvements
      where improvement_status = 'open' and property_id is not null
      group by property_id
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      sales.ownership_changes, sales.last_sale, op.open_permits,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from sales
    join op on op.property_id = sales.property_id
    join properties p on p.property_id = sales.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd(propertyPredicates(f))}
    order by op.open_permits desc, sales.ownership_changes desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #18 Properties with active permit activity and business turnover.
// (Turnover proxied by multiple distinct occupants; Sunbiz has no filing dates.)
// ---------------------------------------------------------------------------

async function runActivePermitsBusinessTurnover(
  f: Filters
): Promise<InquiryResult<ActivePermitTurnoverRow>> {
  const rows = await exec<ActivePermitTurnoverRow>(sql`
    with op as (
      select property_id, count(*)::int as open_permits
      from property_improvements
      where improvement_status = 'open' and property_id is not null
      group by property_id
    ),
    occ as (
      select property_id, count(*)::int as occupant_count,
        count(distinct company_id)::int as distinct_occupants
      from occupancies
      where property_id is not null
      group by property_id
      having count(*) > 1
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      op.open_permits, occ.occupant_count, occ.distinct_occupants,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from occ
    join op on op.property_id = occ.property_id
    join properties p on p.property_id = occ.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd(propertyPredicates(f))}
    order by op.open_permits desc, occ.occupant_count desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #19 Neighborhoods with increasing permit activity.
// Recent-window vs prior-window permit counts (inspection-dated), recent > prior.
// ---------------------------------------------------------------------------

async function runIncreasingNeighborhoods(
  f: Filters
): Promise<InquiryResult<IncreasingNeighborhoodRow>> {
  const rows = await exec<IncreasingNeighborhoodRow>(sql`
    with permit_year as (
      select pi.property_id, pi.property_improvement_id, max(i.completed_date) as d
      from property_improvements pi
      join inspections i on i.property_improvement_id = pi.property_improvement_id
      where pi.property_id is not null
      group by pi.property_id, pi.property_improvement_id
    ),
    sub as (
      select p.subdivision,
        count(*) filter (where pa.d >= current_date - interval '3 years')::int as recent_permits,
        count(*) filter (where pa.d < current_date - interval '3 years' and pa.d >= current_date - interval '6 years')::int as prior_permits,
        min(p.source_artifact_uri) as sample_url
      from permit_year pa
      join properties p on p.property_id = pa.property_id
      where p.subdivision is not null and p.subdivision <> ''
      group by p.subdivision
    )
    select subdivision as neighborhood, recent_permits, prior_permits,
      (recent_permits - prior_permits) as activity_increase,
      sample_url as source_url,
      count(*) over()::int as full_count
    from sub
    where recent_permits > prior_permits and recent_permits >= ${NEIGHBORHOOD_MIN_RECENT_PERMITS}
    order by (recent_permits - prior_permits) desc, subdivision
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "neighborhood",
    entityId: r.neighborhood,
    label: r.neighborhood,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #20 Neighborhoods with the highest concentration of major renovations.
// ---------------------------------------------------------------------------

async function runRenovationNeighborhoods(
  f: Filters
): Promise<InquiryResult<RenovationNeighborhoodRow>> {
  const rows = await exec<RenovationNeighborhoodRow>(sql`
    with major as (
      select pi.property_id, pi.property_improvement_id
      from property_improvements pi
      where pi.property_id is not null and cardinality(${renovationCategorySql}) > 0
    ),
    sub as (
      select p.subdivision,
        count(distinct m.property_improvement_id)::int as major_renovations,
        count(distinct m.property_id)::int as properties_affected,
        min(p.source_artifact_uri) as sample_url
      from major m
      join properties p on p.property_id = m.property_id
      where p.subdivision is not null and p.subdivision <> ''
      group by p.subdivision
    )
    select subdivision as neighborhood, major_renovations, properties_affected,
      sample_url as source_url,
      count(*) over()::int as full_count
    from sub
    order by major_renovations desc, subdivision
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "neighborhood",
    entityId: r.neighborhood,
    label: r.neighborhood,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #21 Most active contractors by project count.
// ---------------------------------------------------------------------------

async function runMostActiveContractors(
  f: Filters
): Promise<InquiryResult<MostActiveContractorRow>> {
  const rows = await exec<MostActiveContractorRow>(sql`
    with proj as (
      select pi.contractor_company_id, count(*)::int as project_count
      from property_improvements pi
      where pi.contractor_company_id is not null
      group by pi.contractor_company_id
    )
    select c.company_id, c.name as contractor_name, proj.project_count,
      brp.bbb_rating, cqs.score_band,
      coalesce(brp.profile_url, c.source_artifact_uri) as source_url,
      count(*) over()::int as full_count
    from proj
    join companies c on c.company_id = proj.contractor_company_id
    left join lateral (
      select bbb_rating, profile_url from business_reputation_profiles b
      where b.company_id = c.company_id order by b.updated_at desc nulls last limit 1
    ) brp on true
    left join lateral (
      select score_band from contractor_quality_scores q
      where q.company_id = c.company_id order by q.created_at desc nulls last limit 1
    ) cqs on true
    ${whereAnd([contractorNameFilter(f)])}
    order by proj.project_count desc, c.name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "contractor",
    entityId: r.company_id,
    label: r.contractor_name ?? r.company_id,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// #22 Most active businesses by property footprint.
// ---------------------------------------------------------------------------

async function runMostActiveBusinesses(f: Filters): Promise<InquiryResult<MostActiveBusinessRow>> {
  const rows = await exec<MostActiveBusinessRow>(sql`
    with footprint as (
      select o.company_id, count(distinct o.property_id)::int as property_count
      from occupancies o
      where o.company_id is not null
      group by o.company_id
    )
    select c.company_id, c.name as business_name, footprint.property_count,
      c.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from footprint
    join companies c on c.company_id = footprint.company_id
    order by footprint.property_count desc, c.name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "business",
    entityId: r.company_id,
    label: r.business_name ?? r.company_id,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// Stretch inquiries (cheap, non-empty-verified).
// ---------------------------------------------------------------------------

// Stretch: properties likely undergoing redevelopment (demolition + new build).
async function runRedevelopmentCandidates(
  f: Filters
): Promise<InquiryResult<RedevelopmentCandidateRow>> {
  const rows = await exec<RedevelopmentCandidateRow>(sql`
    with signals as (
      select pi.property_id,
        count(*) filter (where lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'demolition|demo')::int as demolition_permits,
        count(*) filter (where lower(coalesce(pi.improvement_type,'')||' '||coalesce(pi.project_description,'')) ~ 'new construction|new development|addition|new building|single family')::int as construction_permits
      from property_improvements pi
      where pi.property_id is not null
      group by pi.property_id
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      signals.demolition_permits, signals.construction_permits,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from signals
    join properties p on p.property_id = signals.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd([...propertyPredicates(f), sql`signals.demolition_permits > 0`, sql`signals.construction_permits > 0`])}
    order by (signals.demolition_permits + signals.construction_permits) desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// Stretch: properties showing value-add investment (>= N distinct major categories).
async function runValueAddProperties(f: Filters): Promise<InquiryResult<ValueAddPropertyRow>> {
  const rows = await exec<ValueAddPropertyRow>(sql`
    with major as (
      select pi.property_id, pi.property_improvement_id, ${renovationCategorySql} as cats
      from property_improvements pi
      where pi.property_id is not null and cardinality(${renovationCategorySql}) > 0
    ),
    agg as (
      select m.property_id,
        count(distinct c)::int as distinct_major_categories,
        count(distinct m.property_improvement_id)::int as major_permits,
        string_agg(distinct c, ', ' order by c) as categories
      from major m, unnest(m.cats) as c
      group by m.property_id
      having count(distinct c) >= ${VALUE_ADD_MIN_CATEGORIES}
    )
    select p.property_id, p.parcel_identifier,
      a.unnormalized_address as address, a.city_name as city,
      agg.distinct_major_categories, agg.major_permits, agg.categories,
      p.source_artifact_uri as source_url,
      count(*) over()::int as full_count
    from agg
    join properties p on p.property_id = agg.property_id
    join addresses a on a.address_id = p.address_id
    join parcels pc on pc.parcel_id = p.parcel_id
    ${whereAnd(propertyPredicates(f))}
    order by agg.distinct_major_categories desc, agg.major_permits desc, p.parcel_identifier
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "property",
    entityId: r.property_id,
    label: propertyLabel(r.parcel_identifier, r.address),
    sourceUrl: r.source_url,
  }));
}

// Stretch: contractors with the highest number of complaint-linked projects.
async function runComplaintProjectContractors(
  f: Filters
): Promise<InquiryResult<ComplaintProjectContractorRow>> {
  const rows = await exec<ComplaintProjectContractorRow>(sql`
    select c.company_id, c.name as contractor_name, brp.complaint_count, brp.bbb_rating,
      (select count(*)::int from property_improvements pi where pi.contractor_company_id = c.company_id) as complaint_linked_projects,
      brp.profile_url as source_url,
      count(*) over()::int as full_count
    from companies c
    join lateral (
      select complaint_count, bbb_rating, profile_url from business_reputation_profiles b
      where b.company_id = c.company_id and b.complaint_count > 0
      order by b.complaint_count desc nulls last limit 1
    ) brp on true
    where exists (select 1 from property_improvements pi where pi.contractor_company_id = c.company_id)
      ${f.contractor ? sql`and c.name ilike ${"%" + f.contractor + "%"}` : sql``}
    order by complaint_linked_projects desc, brp.complaint_count desc, c.name
    limit ${f.pageSize} offset ${offset(f)}
  `);
  return finalize(rows, (r) => ({
    entityType: "contractor",
    entityId: r.company_id,
    label: r.contractor_name ?? r.company_id,
    sourceUrl: r.source_url,
  }));
}

// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------

export const INQUIRIES: Inquiry[] = [
  {
    key: "properties-multiple-open-permits",
    label: "Properties with more than one open permit",
    category: "permits",
    description:
      "Properties that currently have two or more permits in an open status, ranked by open-permit count.",
    run: runMultipleOpenPermits,
  },
  {
    key: "properties-open-roofing-permit",
    label: "Properties with open roofing permits",
    category: "permits",
    description:
      "Properties with at least one open permit classified as roofing work (roof / reroof / shingle).",
    run: makeOpenCategoryInquiry("roofing"),
  },
  {
    key: "properties-open-electrical-permit",
    label: "Properties with open electrical permits",
    category: "permits",
    description:
      "Properties with at least one open permit classified as electrical work (electric / wiring / panel / solar).",
    run: makeOpenCategoryInquiry("electrical"),
  },
  {
    key: "properties-major-concrete-work",
    label: "Properties that underwent major concrete work",
    category: "renovations",
    description:
      "Properties with permits classified as concrete work (concrete / foundation / slab / seawall), any status.",
    run: makeMajorWorkInquiry("concrete"),
  },
  {
    key: "properties-major-roof-replacement",
    label: "Properties that underwent major roof replacements",
    category: "renovations",
    description:
      "Properties with permits classified as roofing work (roof / reroof / shingle), any status.",
    run: makeMajorWorkInquiry("roofing"),
  },
  {
    key: "properties-major-electrical-upgrade",
    label: "Properties that underwent major electrical upgrades",
    category: "renovations",
    description:
      "Properties with permits classified as electrical work (electric / wiring / panel / solar), any status.",
    run: makeMajorWorkInquiry("electrical"),
  },
  {
    key: "properties-highest-permit-activity",
    label: "Properties with the highest permit activity in the last five years",
    category: "permits",
    description:
      "Properties ranked by number of permits active in the last five years. Permit timing is derived from the latest inspection date on each permit, since the source export does not populate permit issue/completion dates.",
    run: runHighestPermitActivity,
  },
  {
    key: "properties-significant-renovation",
    label: "Properties with significant renovation activity",
    category: "renovations",
    description: `Properties with at least ${String(SIGNIFICANT_RENOVATION_MIN_PERMITS)} major-category renovation permits (roofing, electrical, concrete, structural, plumbing, HVAC).`,
    run: runSignificantRenovation,
  },
  {
    key: "contractors-roofing-lee-county",
    label: "Contractors performing roofing work in Lee County",
    category: "contractors",
    description:
      "Companies acting as contractor on Lee County roofing permits, ranked by matching project count, with BBB rating and quality band.",
    run: makeContractorWorkInquiry("roofing"),
  },
  {
    key: "contractors-electrical-lee-county",
    label: "Contractors performing electrical work in Lee County",
    category: "contractors",
    description:
      "Companies acting as contractor on Lee County electrical permits, ranked by matching project count, with BBB rating and quality band.",
    run: makeContractorWorkInquiry("electrical"),
  },
  {
    key: "contractors-negative-bbb",
    label: "Contractors with negative BBB ratings",
    category: "contractors",
    description:
      "Contractor companies whose BBB rating is F/D/C- or whose derived quality band is poor/fair/marginal, with linked project counts.",
    run: runNegativeBbbContractors,
  },
  {
    key: "contractors-complaint-history",
    label: "Contractors with complaint histories",
    category: "contractors",
    description:
      "Contractor companies with one or more BBB complaints on file, ranked by complaint count.",
    run: runComplaintContractors,
  },
  {
    key: "projects-negative-contractors",
    label: "Projects by contractors with negative BBB or complaints",
    category: "cross-signal",
    description:
      "Individual permits whose contractor has a negative BBB rating, a poor/fair/marginal quality band, or at least one complaint.",
    run: runNegativeContractorProjects,
  },
  {
    key: "businesses-multiple-properties",
    label: "Businesses operating across multiple properties",
    category: "businesses",
    description:
      "Sunbiz businesses (companies) whose occupancy records place them at more than one distinct property.",
    run: runBusinessesMultipleProperties,
  },
  {
    key: "owners-multiple-properties",
    label: "Owners associated with multiple properties",
    category: "owners",
    description:
      "Owner names (owned_by) that appear on more than one distinct property, ranked by property count.",
    run: runOwnersMultipleProperties,
  },
  {
    key: "tenants-multiple-locations",
    label: "Tenants operating across multiple locations",
    category: "tenants",
    description:
      "Business tenants (Sunbiz registrations, occupancy-derived) present at more than one property location.",
    run: runTenantsMultipleLocations,
  },
  {
    key: "properties-ownership-change-active-permits",
    label: "Properties with ownership changes and active permits",
    category: "cross-signal",
    description:
      "Properties with more than one recorded sale (ownership change) that also currently have at least one open permit.",
    run: runOwnershipChangeActivePermits,
  },
  {
    key: "properties-active-permits-business-turnover",
    label: "Properties with active permits and business turnover",
    category: "cross-signal",
    description:
      "Properties with at least one open permit and more than one business occupant (turnover proxied by multiple occupants; Sunbiz has no filing dates).",
    run: runActivePermitsBusinessTurnover,
  },
  {
    key: "neighborhoods-increasing-permits",
    label: "Neighborhoods with increasing permit activity",
    category: "neighborhoods",
    description:
      "Subdivisions where permit activity in the last three years exceeds the prior three years (permit timing derived from inspection dates).",
    run: runIncreasingNeighborhoods,
  },
  {
    key: "neighborhoods-major-renovation-concentration",
    label: "Neighborhoods with the highest concentration of major renovations",
    category: "neighborhoods",
    description:
      "Subdivisions ranked by the number of major-category renovation permits across their properties.",
    run: runRenovationNeighborhoods,
  },
  {
    key: "contractors-most-active",
    label: "Most active contractors by project count",
    category: "contractors",
    description:
      "Contractor companies ranked by total number of permits on which they are the contractor.",
    run: runMostActiveContractors,
  },
  {
    key: "businesses-most-active-footprint",
    label: "Most active businesses by property footprint",
    category: "businesses",
    description:
      "Businesses ranked by the number of distinct properties they occupy (property footprint).",
    run: runMostActiveBusinesses,
  },
  {
    key: "stretch-redevelopment-candidates",
    label: "Properties likely undergoing redevelopment",
    category: "cross-signal",
    description:
      "Stretch: properties with both demolition permits and new-construction/addition permits — a redevelopment signal.",
    run: runRedevelopmentCandidates,
  },
  {
    key: "stretch-value-add-investment",
    label: "Properties showing value-add investment activity",
    category: "renovations",
    description: `Stretch: properties with permits spanning at least ${String(VALUE_ADD_MIN_CATEGORIES)} distinct major renovation categories.`,
    run: runValueAddProperties,
  },
  {
    key: "stretch-contractors-most-complaint-projects",
    label: "Contractors with the most complaint-linked projects",
    category: "contractors",
    description:
      "Stretch: contractors that have BBB complaints, ranked by the number of permits (projects) they are linked to.",
    run: runComplaintProjectContractors,
  },
];

export function getInquiry(key: string): Inquiry | undefined {
  return INQUIRIES.find((inquiry) => inquiry.key === key);
}

export async function runInquiry(key: string, filters: Filters): Promise<InquiryResult> {
  const inquiry = getInquiry(key);
  if (inquiry === undefined) {
    throw new Error(`Unknown inquiry: ${key}`);
  }
  return inquiry.run(filters);
}

// ---------------------------------------------------------------------------
// #23 Relationship graph for a selected property.
// Separate export (keyed by propertyId, not Filters): resolves the property's
// owners, contractors, business tenants, and permits into a single graph with
// provenance citations for every node.
// ---------------------------------------------------------------------------

export type PropertyNodeRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  county: string | null;
  property_type: string | null;
  subdivision: string | null;
  source_url: string | null;
};

export type OwnerNodeRow = {
  owner_name: string | null;
  ownership_percentage: string | null;
  owner_occupied: boolean | null;
  source_url: string | null;
};

export type ContractorNodeRow = {
  company_id: string;
  contractor_name: string | null;
  project_count: number;
  bbb_rating: string | null;
  score_band: string | null;
  source_url: string | null;
};

export type TenantNodeRow = {
  business_registration_id: string | null;
  tenant_name: string | null;
  status: string | null;
  filing_type: string | null;
  source_url: string | null;
};

export type PermitNodeRow = {
  property_improvement_id: string;
  permit_number: string | null;
  improvement_type: string | null;
  improvement_status: string | null;
  contractor_name: string | null;
  source_url: string | null;
};

export type RelationshipGraph = {
  property: PropertyNodeRow | null;
  owners: OwnerNodeRow[];
  contractors: ContractorNodeRow[];
  tenants: TenantNodeRow[];
  permits: PermitNodeRow[];
  citations: Citation[];
};

export async function relationshipGraph(propertyId: string): Promise<RelationshipGraph> {
  const db = getDb();
  const [propertyRes, ownersRes, contractorsRes, tenantsRes, permitsRes] = await Promise.all([
    db.execute(sql`
      select p.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, pc.county_name as county,
        p.property_type, p.subdivision, p.source_artifact_uri as source_url
      from properties p
      join addresses a on a.address_id = p.address_id
      join parcels pc on pc.parcel_id = p.parcel_id
      where p.property_id = ${propertyId}
    `),
    db.execute(sql`
      select owned_by as owner_name, ownership_percentage::text as ownership_percentage,
        owner_occupied_indicator as owner_occupied, source_artifact_uri as source_url
      from ownerships where property_id = ${propertyId}
      order by ownership_percentage desc nulls last
    `),
    db.execute(sql`
      select c.company_id, c.name as contractor_name,
        count(*)::int as project_count,
        brp.bbb_rating, cqs.score_band,
        coalesce(brp.profile_url, c.source_artifact_uri) as source_url
      from property_improvements pi
      join companies c on c.company_id = pi.contractor_company_id
      left join lateral (
        select bbb_rating, profile_url from business_reputation_profiles b
        where b.company_id = c.company_id order by b.updated_at desc nulls last limit 1
      ) brp on true
      left join lateral (
        select score_band from contractor_quality_scores q
        where q.company_id = c.company_id order by q.created_at desc nulls last limit 1
      ) cqs on true
      where pi.property_id = ${propertyId} and pi.contractor_company_id is not null
      group by c.company_id, c.name, brp.bbb_rating, cqs.score_band, brp.profile_url, c.source_artifact_uri
      order by project_count desc, c.name
    `),
    db.execute(sql`
      select br.business_registration_id, br.entity_name as tenant_name, br.status, br.filing_type,
        br.source_artifact_uri as source_url
      from occupancies o
      join business_registrations br on br.business_registration_id = o.business_registration_id
      where o.property_id = ${propertyId}
      order by br.entity_name
    `),
    db.execute(sql`
      select pi.property_improvement_id, pi.permit_number, pi.improvement_type, pi.improvement_status,
        c.name as contractor_name,
        coalesce(
          case when pi.source_url ~ '^(https?|ipfs)' then pi.source_url end,
          (select source_artifact_uri from properties p2 where p2.property_id = pi.property_id)
        ) as source_url
      from property_improvements pi
      left join companies c on c.company_id = pi.contractor_company_id
      where pi.property_id = ${propertyId}
      order by pi.improvement_status nulls last, pi.permit_number
    `),
  ]);

  const property = (propertyRes.rows as PropertyNodeRow[])[0] ?? null;
  const owners = ownersRes.rows as OwnerNodeRow[];
  const contractors = contractorsRes.rows as ContractorNodeRow[];
  const tenants = tenantsRes.rows as TenantNodeRow[];
  const permits = permitsRes.rows as PermitNodeRow[];

  const citations: Citation[] = [];
  if (property) {
    citations.push({
      entityType: "property",
      entityId: property.property_id,
      label: propertyLabel(property.parcel_identifier, property.address),
      sourceUrl: property.source_url,
    });
  }
  for (const owner of owners) {
    if (owner.owner_name) {
      citations.push({
        entityType: "owner",
        entityId: owner.owner_name,
        label: owner.owner_name,
        sourceUrl: owner.source_url,
      });
    }
  }
  for (const contractor of contractors) {
    citations.push({
      entityType: "contractor",
      entityId: contractor.company_id,
      label: contractor.contractor_name ?? contractor.company_id,
      sourceUrl: contractor.source_url,
    });
  }
  for (const tenant of tenants) {
    citations.push({
      entityType: "tenant",
      entityId: tenant.business_registration_id ?? tenant.tenant_name ?? "tenant",
      label: tenant.tenant_name ?? "tenant",
      sourceUrl: tenant.source_url,
    });
  }
  for (const permit of permits) {
    citations.push({
      entityType: "permit",
      entityId: permit.property_improvement_id,
      label: permit.permit_number ?? permit.improvement_type ?? "permit",
      sourceUrl: permit.source_url,
    });
  }

  return { property, owners, contractors, tenants, permits, citations };
}
