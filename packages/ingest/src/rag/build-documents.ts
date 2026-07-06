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
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
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
    row.property_type ? `Type: ${show(row.property_type)}${row.usage_type ? ` (${show(row.usage_type)})` : ""}.` : "",
    row.built_year ? `Built ${show(row.built_year)}.` : "",
    row.owner ? `Owner: ${show(row.owner)}.` : "",
    row.assessed_value ? `Assessed value $${show(row.assessed_value)}.` : "",
    row.permit_count ? `${show(row.permit_count)} permits (${show(row.open_permits ?? 0)} open).` : "No permits.",
    list(row.improvement_types).length ? `Improvements: ${list(row.improvement_types).slice(0, 12).join("; ")}.` : "",
    list(row.businesses).length ? `Businesses at this address: ${list(row.businesses).slice(0, 12).join("; ")}.` : "",
    list(row.contractors).length ? `Contractors: ${list(row.contractors).slice(0, 12).join("; ")}.` : "",
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
    row.is_accredited === true ? "BBB accredited." : row.is_accredited === false ? "Not BBB accredited." : "",
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

type Builder = { entityType: string; query: ReturnType<typeof sql>; map: (row: DocInput) => BuiltDoc };

const BUILDERS: Builder[] = [
  {
    entityType: "property",
    map: propertyDoc,
    query: sql`
      select p.property_id as entity_id, p.parcel_identifier,
        a.unnormalized_address as address, a.city_name as city, a.postal_code as zip,
        p.property_type, p.property_usage_type as usage_type, p.property_structure_built_year as built_year,
        (select o.owned_by from ownerships o where o.property_id = p.property_id limit 1) as owner,
        (select t.property_assessed_value_amount from taxes t where t.property_id = p.property_id
           order by t.tax_year desc nulls last limit 1) as assessed_value,
        (select count(*) from property_improvements pi where pi.property_id = p.property_id) as permit_count,
        (select count(*) from property_improvements pi where pi.property_id = p.property_id
           and pi.improvement_status = 'open') as open_permits,
        (select array_agg(distinct pi.improvement_type) from property_improvements pi
           where pi.property_id = p.property_id and pi.improvement_type is not null) as improvement_types,
        (select array_agg(distinct br.entity_name) from occupancies oc
           join business_registrations br on br.business_registration_id = oc.business_registration_id
           where oc.property_id = p.property_id) as businesses,
        (select array_agg(distinct c.name || ' [BBB ' || coalesce(brp.bbb_rating, 'n/a') || ']')
           from property_improvements pi join companies c on c.company_id = pi.contractor_company_id
           left join business_reputation_profiles brp on brp.company_id = c.company_id
           where pi.property_id = p.property_id and c.name is not null) as contractors,
        p.source_artifact_uri as source_uri
      from properties p
      join addresses a on a.address_id = p.address_id
      where exists (select 1 from property_improvements pi where pi.property_id = p.property_id)
         or exists (select 1 from occupancies oc where oc.property_id = p.property_id)
    `,
  },
  {
    entityType: "contractor",
    map: contractorDoc,
    query: sql`
      select brp.business_reputation_profile_id as entity_id, brp.name, brp.bbb_rating,
        brp.is_accredited, brp.review_count, brp.complaint_count, cqs.score_band,
        brp.profile_url as source_uri,
        (select count(distinct pi.property_id) from property_improvements pi
           where pi.contractor_company_id = brp.company_id) as properties_worked
      from business_reputation_profiles brp
      left join contractor_quality_scores cqs
        on cqs.business_reputation_profile_id = brp.business_reputation_profile_id
    `,
  },
  {
    entityType: "business",
    map: businessDoc,
    query: sql`
      select br.business_registration_id as entity_id, br.entity_name, br.status, br.filing_type,
        br.filed_date, br.source_artifact_uri as source_uri,
        (select array_agg(distinct pt.name) from business_registration_parties pt
           where pt.business_registration_id = br.business_registration_id and pt.party_role = 'OFFICER') as officers,
        (select count(distinct oc.property_id) from occupancies oc
           where oc.business_registration_id = br.business_registration_id) as locations
      from business_registrations br
    `,
  },
  {
    entityType: "neighborhood",
    map: neighborhoodDoc,
    query: sql`
      select p.subdivision, count(*) as property_count,
        count(*) filter (where exists (select 1 from property_improvements pi where pi.property_id = p.property_id)) as permit_properties,
        round(avg((select t.property_assessed_value_amount::numeric from taxes t
          where t.property_id = p.property_id order by t.tax_year desc nulls last limit 1))) as avg_assessed
      from properties p
      where p.subdivision is not null and p.subdivision <> ''
      group by p.subdivision
      having count(*) >= 5
    `,
  },
];

export async function runBuildDocuments(db: Database): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const builder of BUILDERS) {
    logger.info({ entityType: builder.entityType }, "build_documents_started");
    const result = await db.execute(builder.query);
    const docs = result.rows.map((row) => builder.map(row as DocInput));
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
    }
    counts[builder.entityType] = docs.length;
    logger.info({ entityType: builder.entityType, docs: docs.length }, "build_documents_complete");
  }
  return counts;
}
