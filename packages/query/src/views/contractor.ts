import { sql, type SQL } from "drizzle-orm";

import { getDb } from "../db.js";
import { offset, whereAnd, type Filters } from "../filters.js";

// Contractor view over BBB reputation profiles. A contractor is a
// business_reputation_profiles row (provider = 'bbb') linked to a companies row via
// company_id, and reached from permits through property_improvements.contractor_company_id.
// Per contractor this surfaces project/permit history (with property address), the BBB
// rating + accreditation, complaints, review summaries, and the properties worked.

// Inline predicates off the shared grammar (filters.ts is not editable here).
function contractorPredicates(f: Filters): (SQL | null)[] {
  return [
    sql`brp.provider = 'bbb'`,
    f.q ? sql`brp.name ilike ${"%" + f.q + "%"}` : null,
    f.contractor ? sql`brp.name ilike ${"%" + f.contractor + "%"}` : null,
  ];
}

export type ContractorListRow = {
  business_reputation_profile_id: string;
  name: string | null;
  bbb_rating: string | null;
  is_accredited: boolean | null;
  score_band: string | null;
  project_count: number;
  complaint_count: number | null;
  review_count: number | null;
  source_url: string | null;
};

export type ContractorCore = {
  business_reputation_profile_id: string;
  company_id: string | null;
  name: string | null;
  legal_name: string | null;
  bbb_rating: string | null;
  rating_score: string | null;
  is_accredited: boolean | null;
  accreditation_status: string | null;
  accredited_since: string | null;
  review_average_rating: string | null;
  review_count: number | null;
  complaint_count: number | null;
  profile_url: string | null;
  source_system: string | null;
  source_url: string | null;
};

export type ContractorQualityScoreRow = {
  score: string | null;
  score_band: string | null;
  scoring_model: string;
  match_confidence: string | null;
};

export type ContractorPermitRow = {
  property_improvement_id: string;
  property_id: string | null;
  permit_number: string | null;
  improvement_type: string | null;
  improvement_status: string | null;
  completion_date: string | null;
  project_description: string | null;
  source_url: string | null;
  parcel_identifier: string | null;
  address: string | null;
  city: string | null;
};

export type ContractorComplaintRow = {
  complaint_date: string | null;
  complaint_type: string | null;
  complaint_status: string | null;
  complaint_summary: string | null;
};

export type ContractorReviewRow = {
  review_date: string | null;
  review_rating: string | null;
  review_title: string | null;
  review_text: string | null;
  reviewer_display_name: string | null;
};

export type ContractorPropertyRelationRow = {
  property_id: string;
  parcel_identifier: string;
  address: string | null;
  city: string | null;
  relationship: string;
};

export type ContractorDetail = ContractorCore & {
  qualityScores: ContractorQualityScoreRow[];
  projects: ContractorPermitRow[];
  complaints: ContractorComplaintRow[];
  reviews: ContractorReviewRow[];
  relationships: ContractorPropertyRelationRow[];
};

export async function listContractors(f: Filters): Promise<{ rows: ContractorListRow[]; total: number }> {
  const db = getDb();
  const where = whereAnd(contractorPredicates(f));
  const rows = await db.execute(sql`
    select brp.business_reputation_profile_id, brp.name, brp.bbb_rating, brp.is_accredited,
      (select cqs.score_band from contractor_quality_scores cqs
        where cqs.business_reputation_profile_id = brp.business_reputation_profile_id limit 1) as score_band,
      (select count(distinct pi.property_improvement_id)::int from property_improvements pi
        where pi.contractor_company_id = brp.company_id) as project_count,
      brp.complaint_count, brp.review_count,
      brp.profile_url as source_url
    from business_reputation_profiles brp
    ${where}
    order by brp.name nulls last
    limit ${f.pageSize} offset ${offset(f)}
  `);
  const totalRes = await db.execute(sql`
    select count(*)::int as n from business_reputation_profiles brp
    ${where}
  `);
  return {
    rows: rows.rows as ContractorListRow[],
    total: Number((totalRes.rows[0] as { n: number }).n),
  };
}

export async function getContractor(
  businessReputationProfileId: string
): Promise<ContractorDetail | null> {
  const db = getDb();
  const core = await db.execute(sql`
    select brp.business_reputation_profile_id, brp.company_id, brp.name, brp.legal_name,
      brp.bbb_rating, brp.rating_score, brp.is_accredited, brp.accreditation_status,
      brp.accredited_since, brp.review_average_rating, brp.review_count, brp.complaint_count,
      brp.profile_url, brp.source_system, brp.source_artifact_uri as source_url
    from business_reputation_profiles brp
    where brp.business_reputation_profile_id = ${businessReputationProfileId}
  `);
  if (core.rows.length === 0) return null;
  const coreRow = core.rows[0] as ContractorCore;
  const companyId = coreRow.company_id;

  const [qualityScores, projects, complaints, reviews, relationships] = await Promise.all([
    // BBB rating + accreditation are on the core row; the derived quality band lives here.
    db.execute(sql`select score, score_band, scoring_model, match_confidence
      from contractor_quality_scores
      where business_reputation_profile_id = ${businessReputationProfileId}
      order by created_at desc`),
    // Project + permit history: property_improvements this contractor's company built,
    // with property address. Left join so permits with no matched property still show.
    db.execute(sql`select pi.property_improvement_id, pi.property_id, pi.permit_number,
        pi.improvement_type, pi.improvement_status, pi.completion_date, pi.project_description,
        pi.source_url, coalesce(p.parcel_identifier, pi.parcel_identifier) as parcel_identifier,
        a.unnormalized_address as address, a.city_name as city
      from property_improvements pi
      left join properties p on p.property_id = pi.property_id
      left join addresses a on a.address_id = p.address_id
      where pi.contractor_company_id = ${companyId}
      order by pi.completion_date desc nulls last`),
    // BBB complaints filed against the contractor.
    db.execute(sql`select complaint_date, complaint_type, complaint_status, complaint_summary
      from business_reputation_complaints
      where business_reputation_profile_id = ${businessReputationProfileId}
      order by complaint_date desc nulls last`),
    // BBB reviews of the contractor.
    db.execute(sql`select review_date, review_rating, review_title, review_text, reviewer_display_name
      from business_reputation_reviews
      where business_reputation_profile_id = ${businessReputationProfileId}
      order by review_date desc nulls last`),
    // Contractor-to-property relationships: distinct matched properties worked on.
    db.execute(sql`select distinct p.property_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, 'worked_on'::text as relationship
      from property_improvements pi
      join properties p on p.property_id = pi.property_id
      join addresses a on a.address_id = p.address_id
      where pi.contractor_company_id = ${companyId}`),
  ]);

  return {
    ...coreRow,
    qualityScores: qualityScores.rows as ContractorQualityScoreRow[],
    projects: projects.rows as ContractorPermitRow[],
    complaints: complaints.rows as ContractorComplaintRow[],
    reviews: reviews.rows as ContractorReviewRow[],
    relationships: relationships.rows as ContractorPropertyRelationRow[],
  };
}
