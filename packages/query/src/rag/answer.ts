import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { bedrockCredentialProvider, bedrockRegion, loadEnv } from "@oracle/shared";
import { generateText } from "ai";
import { sql } from "drizzle-orm";

import { getDb } from "../db.js";
import type { Filters } from "../filters.js";
import { INQUIRIES, runInquiry, type InquiryRow } from "../inquiries/index.js";
import type { Citation } from "../provenance.js";
import { retrieve, type RetrievalMode } from "./retrieve.js";

// Source-cited natural-language answers: retrieve the most relevant entity
// documents via hybrid search, ground a Bedrock Claude answer strictly in their
// text, and hand back the citations + raw evidence so the UI can prove every
// claim. Retrieval and generation both run through the Vercel AI SDK.

const RETRIEVAL_K = 12;
const DEFAULT_INQUIRY_FILTERS: Filters = {
  page: 1,
  pageSize: 12,
};

const SYSTEM_PROMPT =
  "You answer questions about Lee County property, permit, business, and " +
  "contractor data. Answer ONLY from the provided records. Cite the specific " +
  "properties/contractors/businesses you used. If the records don't support an " +
  "answer, say so. Never invent facts or URLs.";

export type Evidence = {
  title: string;
  body: string;
  sourceUrl: string | null;
};

export type Answer = {
  answer: string;
  citations: Citation[];
  evidence: Evidence[];
  mode: string;
};

type EvidenceRow = {
  entity_type: string;
  entity_id: string;
  title: string;
  body: string;
  source_url: string | null;
};

type CanonicalRoute = {
  inquiryKey: string;
  reason: string;
};

// Cache the Bedrock answer model — building the provider resolves the AWS
// credential chain, so do it once per process rather than per question.
let cachedAnswerModel: ReturnType<ReturnType<typeof createAmazonBedrock>> | null = null;

function getAnswerModel(): ReturnType<ReturnType<typeof createAmazonBedrock>> {
  if (cachedAnswerModel === null) {
    const env = loadEnv();
    const bedrock = createAmazonBedrock({
      region: bedrockRegion(),
      credentialProvider: bedrockCredentialProvider(),
    });
    cachedAnswerModel = bedrock(env.ANSWER_MODEL_ID);
  }
  return cachedAnswerModel;
}

// Composite key for (entity_type, entity_id) — the entity_documents unique key.
// A space separator never appears in an entity_type or a uuid, so no collisions.
function docKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Deterministic natural-language router: map a question to a canonical inquiry
// so the answer is served by typed SQL + real citations with NO model call.
// This is both the fast path and the resilient path — every routed question is
// answerable while Bedrock is fully throttled. Rules are ordered most-specific
// first (contractor/neighborhood/business scopes before generic property-permit
// rules); the first matching rule wins. `q` is normalized to lowercase words.
type RouteRule = { key: string; reason: string; test: (q: string) => boolean };

const ROUTE_RULES: RouteRule[] = [
  // Cross-signal: projects by bad contractors (before the plain contractor rules).
  {
    key: "projects-negative-contractors",
    reason: "matched projects by contractors with negative BBB / complaints",
    test: (q) =>
      q.includes("project") &&
      q.includes("contractor") &&
      (q.includes("negative") || q.includes("complaint") || q.includes("poor")),
  },
  // Contractor-scoped.
  {
    key: "contractors-roofing-lee-county",
    reason: "matched roofing contractors in Lee County",
    test: (q) => q.includes("contractor") && q.includes("roof"),
  },
  {
    key: "contractors-electrical-lee-county",
    reason: "matched electrical contractors in Lee County",
    test: (q) => q.includes("contractor") && q.includes("electric"),
  },
  {
    key: "contractors-negative-bbb",
    reason: "matched contractors with negative BBB ratings",
    test: (q) =>
      (q.includes("poor") || q.includes("negative") || q.includes("bad") || q.includes("low")) &&
      (q.includes("bbb") || q.includes("rating")),
  },
  {
    key: "contractors-complaint-history",
    reason: "matched contractors with complaint histories",
    test: (q) => q.includes("contractor") && q.includes("complaint"),
  },
  {
    key: "contractors-most-active",
    reason: "matched most active contractors by project count",
    test: (q) =>
      q.includes("contractor") &&
      (q.includes("most active") || q.includes("busiest") || q.includes("project count")),
  },
  // Neighborhoods.
  {
    key: "neighborhoods-increasing-permits",
    reason: "matched neighborhoods with increasing permit activity",
    test: (q) =>
      q.includes("neighborhood") &&
      (q.includes("increas") || q.includes("grow") || q.includes("rising")),
  },
  {
    key: "neighborhoods-major-renovation-concentration",
    reason: "matched neighborhoods by major-renovation concentration",
    test: (q) => q.includes("neighborhood") && (q.includes("renovat") || q.includes("major")),
  },
  // Businesses / owners / tenants.
  {
    key: "businesses-multiple-properties",
    reason: "matched businesses operating across multiple properties",
    test: (q) =>
      q.includes("business") &&
      (q.includes("multiple") || q.includes("across") || q.includes("several")) &&
      (q.includes("propert") || q.includes("location")),
  },
  {
    key: "businesses-most-active-footprint",
    reason: "matched most active businesses by property footprint",
    test: (q) => q.includes("business") && (q.includes("most active") || q.includes("footprint")),
  },
  {
    key: "owners-multiple-properties",
    reason: "matched owners associated with multiple properties",
    test: (q) =>
      q.includes("owner") &&
      (q.includes("multiple") || q.includes("more than one") || q.includes("several")),
  },
  {
    key: "tenants-multiple-locations",
    reason: "matched tenants operating across multiple locations",
    test: (q) =>
      q.includes("tenant") &&
      (q.includes("multiple") || q.includes("across") || q.includes("several")) &&
      (q.includes("location") || q.includes("propert")),
  },
  // Property permits / renovations (generic — after the scoped rules above).
  {
    key: "properties-multiple-open-permits",
    reason: "matched properties with more than one open permit",
    test: (q) =>
      q.includes("open") &&
      q.includes("permit") &&
      (q.includes("multiple") || q.includes("more than one") || q.includes("several")),
  },
  {
    key: "properties-open-roofing-permit",
    reason: "matched properties with open roofing permits",
    test: (q) => q.includes("open") && q.includes("roof"),
  },
  {
    key: "properties-open-electrical-permit",
    reason: "matched properties with open electrical permits",
    test: (q) => q.includes("open") && q.includes("electric"),
  },
  {
    key: "properties-ownership-change-active-permits",
    reason: "matched properties with ownership changes and active permits",
    test: (q) => q.includes("ownership") && q.includes("permit"),
  },
  {
    key: "properties-active-permits-business-turnover",
    reason: "matched properties with active permits and business turnover",
    test: (q) => q.includes("turnover") && q.includes("permit"),
  },
  {
    key: "properties-highest-permit-activity",
    reason: "matched properties with the highest recent permit activity",
    test: (q) =>
      q.includes("permit") &&
      (q.includes("highest") ||
        q.includes("most") ||
        q.includes("five year") ||
        q.includes("5 year")),
  },
  {
    key: "properties-major-concrete-work",
    reason: "matched properties with major concrete work",
    test: (q) => q.includes("concrete"),
  },
  {
    key: "properties-major-roof-replacement",
    reason: "matched properties with major roofing work",
    test: (q) => q.includes("roof"),
  },
  {
    key: "properties-major-electrical-upgrade",
    reason: "matched properties with major electrical work",
    test: (q) => q.includes("electric"),
  },
  {
    key: "stretch-value-add-investment",
    reason: "matched properties showing value-add investment",
    test: (q) => q.includes("value add"),
  },
  {
    key: "properties-significant-renovation",
    reason: "matched properties with significant renovation activity",
    test: (q) => q.includes("renovat") || q.includes("significant"),
  },
  {
    key: "stretch-redevelopment-candidates",
    reason: "matched properties likely undergoing redevelopment",
    test: (q) => q.includes("redevelop"),
  },
];

export function routeCanonicalQuestion(question: string): CanonicalRoute | null {
  const q = normalizeQuestion(question);
  for (const rule of ROUTE_RULES) {
    if (rule.test(q)) return { inquiryKey: rule.key, reason: rule.reason };
  }
  return null;
}

function rowLabel(row: InquiryRow): string {
  const parts = [
    row.parcel_identifier,
    row.address,
    row.city,
    row.contractor_name,
    row.business_name,
    row.tenant_name,
    row.owner_name,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .map(String);

  return parts.length > 0 ? parts.join(" — ") : JSON.stringify(row);
}

function renderInquiryAnswer(label: string, total: number, rows: InquiryRow[]): string {
  if (rows.length === 0) {
    return `No supporting records were found for "${label}" in the loaded Lee County data.`;
  }

  const bullets = rows
    .slice(0, 6)
    .map((row, index) => `${index + 1}. ${rowLabel(row)}`)
    .join("\n");

  return `${label}: found ${total} supporting records. Top results:\n${bullets}`;
}

async function answerViaInquiry(route: CanonicalRoute): Promise<Answer> {
  const inquiry = INQUIRIES.find((i) => i.key === route.inquiryKey);
  if (!inquiry) {
    throw new Error(`Unknown routed inquiry: ${route.inquiryKey}`);
  }

  const result = await runInquiry(route.inquiryKey, DEFAULT_INQUIRY_FILTERS);

  return {
    answer: renderInquiryAnswer(inquiry.label, result.total, result.rows),
    citations: result.citations,
    evidence: result.rows.map((row) => ({
      title: rowLabel(row),
      body: JSON.stringify(row),
      sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    })),
    mode: route.reason,
  };
}

// Fetch title/body/source_url for the retrieved documents, then re-order them to
// match retrieval rank (SQL IN does not preserve the order of the value list).
async function fetchEvidence(citations: Citation[]): Promise<Evidence[]> {
  const db = getDb();
  const keys = citations.map((c) => sql`(${c.entityType}, ${c.entityId}::uuid)`);
  const result = await db.execute(sql`
    select entity_type, entity_id, title, body, source_url
    from entity_documents
    where (entity_type, entity_id) in (${sql.join(keys, sql`, `)})
  `);

  const rows = result.rows as EvidenceRow[];
  const byKey = new Map<string, Evidence>();
  for (const row of rows) {
    byKey.set(docKey(row.entity_type, row.entity_id), {
      title: row.title,
      body: row.body,
      sourceUrl: row.source_url,
    });
  }

  const ordered: Evidence[] = [];
  for (const c of citations) {
    const evidence = byKey.get(docKey(c.entityType, c.entityId));
    if (evidence) ordered.push(evidence);
  }
  return ordered;
}

// Render the evidence as a numbered block the model must ground its answer in.
function renderEvidence(evidence: Evidence[]): string {
  return evidence
    .map((e, i) => {
      const source = e.sourceUrl ?? "no source URL";
      return `[${i + 1}] ${e.title}\n${e.body}\nSource: ${source}`;
    })
    .join("\n\n");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Generate the grounded answer with a bounded retry. Bedrock is rate-limited
// (per-minute and per-day); a short retry clears a transient throttle without
// blowing the page render budget. On persistent failure the caller degrades to
// a deterministic retrieval-only summary rather than surfacing an error.
async function generateGroundedAnswer(prompt: string, attempts = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { text } = await generateText({
        model: getAnswerModel(),
        system: SYSTEM_PROMPT,
        prompt,
      });
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

// Human-readable label for the retrieval tier + whether an LLM composed prose.
function modeLabel(retrievalMode: RetrievalMode, generated: boolean): string {
  const tier = retrievalMode === "lexical" ? "lexical retrieval" : "hybrid retrieval";
  return generated ? `${tier} + generated` : tier;
}

// Deterministic, fully-cited answer built directly from the retrieved records.
// Served whenever no LLM composes prose (RETRIEVAL_MODE with no answer model, or
// the answer model unavailable). It makes no claim beyond "these are the most
// relevant records" — every listed item is a retrieved record with a citation,
// so the "no claim without a record" contract holds with zero model access.
function renderRetrievalOnlyAnswer(
  question: string,
  evidence: Evidence[],
  retrievalMode: RetrievalMode
): string {
  const tier = retrievalMode === "lexical" ? "full-text (lexical)" : "hybrid";
  const bullets = evidence
    .slice(0, 6)
    .map((e, i) => `${i + 1}. ${e.title}`)
    .join("\n");
  return (
    `Retrieval mode: ${tier}. The ${evidence.length} most relevant records for ` +
    `"${question}", each cited below with its source.\n${bullets}`
  );
}

/**
 * Answer a natural-language question grounded strictly in retrieved records.
 * Returns the answer text, the retrieval citations, the raw evidence used, and
 * the retrieval mode. If nothing relevant is retrieved, returns a graceful
 * "no supporting records" answer rather than inventing one.
 */
export async function answerQuestion(question: string): Promise<Answer> {
  const route = routeCanonicalQuestion(question);
  if (route) return answerViaInquiry(route);

  const { citations, mode: retrievalMode } = await retrieve(question, { k: RETRIEVAL_K });
  const noRecords = {
    answer:
      "No supporting records were found for this question in the Lee County " +
      "property, permit, business, or contractor data.",
    citations: [],
    evidence: [],
    mode: modeLabel(retrievalMode, false),
  } satisfies Answer;

  if (citations.length === 0) return noRecords;

  const evidence = await fetchEvidence(citations);
  if (evidence.length === 0) return noRecords;

  const prompt = `Question: ${question}\n\nRecords:\n${renderEvidence(evidence)}`;
  try {
    const text = await generateGroundedAnswer(prompt);
    return { answer: text, citations, evidence, mode: modeLabel(retrievalMode, true) };
  } catch {
    // No answer model available. Retrieval still returned real, cited records, so
    // serve them as a deterministic cited answer — the lexical/hybrid tier is a
    // supported mode, not a failure. No fabricated prose.
    return {
      answer: renderRetrievalOnlyAnswer(question, evidence, retrievalMode),
      citations,
      evidence,
      mode: modeLabel(retrievalMode, false),
    };
  }
}
