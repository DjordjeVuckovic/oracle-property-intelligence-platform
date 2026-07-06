import type { Database } from "@oracle/db";
import { schema } from "@oracle/db";
import { entityId, logger } from "@oracle/shared";
import { sql } from "drizzle-orm";

// Build denormalized retrieval documents (one per entity) for hybrid RAG. Each
// builder is a SQL join that returns raw fields plus a PURE `toDocument` mapper
// that formats the title/body — so text formatting is unit-testable and the SQL
// stays declarative. Only the enriched/derived entities are documented; the 445k
// skeletal properties stay searchable via SQL/FTS + canonical inquiries.

export type DocInput = Record<string, unknown>;
export type BuiltDoc = {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  metadata: Record<string, unknown>;
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
// Safe display coercion for unknown SQL values (always primitives here, but the
// row type is unknown so this keeps the linter honest about stringification).
const show = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

// --- pure document mappers (unit-tested) ---

export function propertyDoc(row: DocInput): BuiltDoc {
  const address = str(row.address) ?? "Unknown address";
  const parts = [
    `Property at ${address}${row.city ? `, ${show(row.city)}` : ""}${row.zip ? ` ${show(row.zip)}` : ""}.`,
    `Parcel ${show(row.parcel_identifier)}.`,
    row.property_type
      ? `Type: ${show(row.property_type)}${row.usage_type ? ` (${show(row.usage_type)})` : ""}.`
      : "",
    row.built_year ? `Built ${show(row.built_year)}.` : "",
    row.owner ? `Owner: ${show(row.owner)}.` : "",
    row.assessed_value ? `Assessed value $${show(row.assessed_value)}.` : "",
    row.permit_count
      ? `${show(row.permit_count)} permits (${show(row.open_permits ?? 0)} open).`
      : "No permits.",
    list(row.improvement_types).length
      ? `Improvements: ${list(row.improvement_types).slice(0, 12).join("; ")}.`
      : "",
    list(row.businesses).length
      ? `Businesses at this address: ${list(row.businesses).slice(0, 12).join("; ")}.`
      : "",
    list(row.contractors).length
      ? `Contractors: ${list(row.contractors).slice(0, 12).join("; ")}.`
      : "",
  ];
  return {
    entityType: "property",
    entityId: show(row.entity_id),
    title: `Property ${address}`,
    body: parts.filter(Boolean).join(" "),
    sourceUrl: str(row.source_uri),
    metadata: { parcelIdentifier: row.parcel_identifier, propertyType: row.property_type },
  };
}

export function contractorDoc(row: DocInput): BuiltDoc {
  const name = str(row.name) ?? "Unknown contractor";
  const parts = [
    `Contractor ${name}.`,
    row.bbb_rating ? `BBB rating ${show(row.bbb_rating)}.` : "",
    row.is_accredited === true
      ? "BBB accredited."
      : row.is_accredited === false
        ? "Not BBB accredited."
        : "",
    row.score_band ? `Quality band: ${show(row.score_band)}.` : "",
    `${show(row.review_count ?? 0)} reviews, ${show(row.complaint_count ?? 0)} complaints.`,
    row.properties_worked ? `Linked to ${show(row.properties_worked)} properties via permits.` : "",
  ];
  return {
    entityType: "contractor",
    entityId: show(row.entity_id),
    title: `Contractor ${name}`,
    body: parts.filter(Boolean).join(" "),
    sourceUrl: str(row.source_uri),
    metadata: { bbbRating: row.bbb_rating, scoreBand: row.score_band },
  };
}

export function businessDoc(row: DocInput): BuiltDoc {
  const name = str(row.entity_name) ?? "Unknown business";
  const parts = [
    `Business ${name}.`,
    row.status ? `Status: ${show(row.status)}.` : "",
    row.filing_type ? `Filing: ${show(row.filing_type)}.` : "",
    row.filed_date ? `Filed ${show(row.filed_date)}.` : "",
    list(row.officers).length ? `Officers: ${list(row.officers).slice(0, 8).join("; ")}.` : "",
    row.locations ? `Registered at ${show(row.locations)} property address(es) in Lee County.` : "",
  ];
  return {
    entityType: "business",
    entityId: show(row.entity_id),
    title: `Business ${name}`,
    body: parts.filter(Boolean).join(" "),
    sourceUrl: str(row.source_uri),
    metadata: { status: row.status, filingType: row.filing_type },
  };
}

export function neighborhoodDoc(row: DocInput): BuiltDoc {
  const subdivision = show(row.subdivision);
  const parts = [
    `Neighborhood ${subdivision}.`,
    `${show(row.property_count)} properties.`,
    row.permit_properties ? `${show(row.permit_properties)} with permit activity.` : "",
    row.avg_assessed ? `Average assessed value $${show(row.avg_assessed)}.` : "",
  ];
  return {
    entityType: "neighborhood",
    entityId: entityId("neighborhood", subdivision),
    title: `Neighborhood ${subdivision}`,
    body: parts.filter(Boolean).join(" "),
    sourceUrl: null,
    metadata: { subdivision, propertyCount: row.property_count },
  };
}

// --- builders: (entityType, SQL, mapper) ---

type Builder = {
  entityType: string;
  query: ReturnType<typeof sql>;
  map: (row: DocInput) => BuiltDoc;
};

const BUILDERS: Builder[] = [
  {
    entityType: "property",
    map: propertyDoc,
    // Single-scan aggregations (one hash-agg per child table) joined onto the
    // enriched property set — avoids per-row correlated subqueries, which are
    // O(n*m) and hang at full scale.
    query: sql`
      with perm as (
        select property_id, count(*) as permit_count,
          count(*) filter (where improvement_status = 'open') as open_permits,
          array_agg(distinct improvement_type) filter (where improvement_type is not null) as improvement_types
        from property_improvements group by property_id
      ),
      biz as (
        select oc.property_id, array_agg(distinct br.entity_name) as businesses
        from occupancies oc
        join business_registrations br on br.business_registration_id = oc.business_registration_id
        group by oc.property_id
      ),
      con as (
        select pi.property_id,
          array_agg(distinct c.name || ' [BBB ' || coalesce(brp.bbb_rating, 'n/a') || ']') as contractors
        from property_improvements pi
        join companies c on c.company_id = pi.contractor_company_id
        left join business_reputation_profiles brp on brp.company_id = c.company_id
        where c.name is not null group by pi.property_id
      ),
      own as (
        select distinct on (property_id) property_id, owned_by from ownerships order by property_id
      ),
      tx as (
        select distinct on (property_id) property_id, property_assessed_value_amount as assessed_value
        from taxes order by property_id, tax_year desc nulls last
      ),
      enriched as (select property_id from perm union select property_id from biz)
      select p.property_id as entity_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, a.postal_code as zip,
        p.property_type, p.property_usage_type as usage_type, p.property_structure_built_year as built_year,
        own.owned_by as owner, tx.assessed_value,
        coalesce(perm.permit_count, 0) as permit_count, coalesce(perm.open_permits, 0) as open_permits,
        perm.improvement_types, biz.businesses, con.contractors, p.source_artifact_uri as source_uri
      from enriched e
      join properties p on p.property_id = e.property_id
      join addresses a on a.address_id = p.address_id
      left join perm on perm.property_id = p.property_id
      left join biz on biz.property_id = p.property_id
      left join con on con.property_id = p.property_id
      left join own on own.property_id = p.property_id
      left join tx on tx.property_id = p.property_id
    `,
  },
  {
    entityType: "contractor",
    map: contractorDoc,
    query: sql`
      with worked as (
        select contractor_company_id as company_id, count(distinct property_id) as properties_worked
        from property_improvements where contractor_company_id is not null
        group by contractor_company_id
      )
      select brp.business_reputation_profile_id as entity_id, brp.name, brp.bbb_rating,
        brp.is_accredited, brp.review_count, brp.complaint_count, cqs.score_band,
        brp.profile_url as source_uri, worked.properties_worked
      from business_reputation_profiles brp
      left join contractor_quality_scores cqs
        on cqs.business_reputation_profile_id = brp.business_reputation_profile_id
      left join worked on worked.company_id = brp.company_id
    `,
  },
  {
    entityType: "business",
    map: businessDoc,
    query: sql`
      with officers as (
        select business_registration_id, array_agg(distinct name) as officers
        from business_registration_parties where party_role = 'OFFICER'
        group by business_registration_id
      ),
      locs as (
        select business_registration_id, count(distinct property_id) as locations
        from occupancies group by business_registration_id
      )
      select br.business_registration_id as entity_id, br.entity_name, br.status, br.filing_type,
        br.filed_date, br.source_artifact_uri as source_uri, officers.officers, locs.locations
      from business_registrations br
      left join officers on officers.business_registration_id = br.business_registration_id
      left join locs on locs.business_registration_id = br.business_registration_id
    `,
  },
  {
    entityType: "neighborhood",
    map: neighborhoodDoc,
    query: sql`
      with tx as (
        select distinct on (property_id) property_id, property_assessed_value_amount::numeric as v
        from taxes order by property_id, tax_year desc nulls last
      ),
      perm as (select distinct property_id from property_improvements)
      select p.subdivision, count(*) as property_count,
        count(*) filter (where perm.property_id is not null) as permit_properties,
        round(avg(tx.v)) as avg_assessed
      from properties p
      left join tx on tx.property_id = p.property_id
      left join perm on perm.property_id = p.property_id
      where p.subdivision is not null and p.subdivision <> ''
      group by p.subdivision
      having count(*) >= 5
    `,
  },
];

export async function runBuildDocuments(db: Database): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const builder of BUILDERS) {
    logger.info({ entityType: builder.entityType }, "build_documents_query_started");
    const result = await db.execute(builder.query);
    const docs = result.rows.map((row) => builder.map(row as DocInput));
    logger.info(
      { entityType: builder.entityType, rows: docs.length },
      "build_documents_query_done"
    );
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500).map((d) => ({
        documentId: entityId("doc", `${d.entityType}:${d.entityId}`),
        entityType: d.entityType,
        entityId: d.entityId,
        title: d.title,
        body: d.body,
        sourceUrl: d.sourceUrl,
        metadata: d.metadata,
      }));
      await db
        .insert(schema.entityDocuments)
        .values(chunk)
        .onConflictDoUpdate({
          target: [schema.entityDocuments.entityType, schema.entityDocuments.entityId],
          set: {
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            sourceUrl: sql`excluded.source_url`,
            metadata: sql`excluded.metadata`,
            embedding: sql`null`,
            updatedAt: sql`now()`,
          },
        });
      if ((i / 500) % 20 === 0 && docs.length > 500) {
        logger.info(
          {
            entityType: builder.entityType,
            upserted: Math.min(i + 500, docs.length),
            total: docs.length,
          },
          "build_documents_progress"
        );
      }
    }
    counts[builder.entityType] = docs.length;
    logger.info({ entityType: builder.entityType, docs: docs.length }, "build_documents_complete");
  }
  return counts;
}
