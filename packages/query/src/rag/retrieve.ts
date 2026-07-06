import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { bedrockCredentialProvider, bedrockRegion, loadEnv } from "@oracle/shared";
import { embed } from "ai";
import { sql } from "drizzle-orm";

import { getDb } from "../db.js";
import type { Citation } from "../provenance.js";

// Hybrid semantic retrieval over entity_documents: fuse pgvector cosine
// similarity with Postgres full-text rank in a single SQL so ranking is
// deterministic and the two signals are combined once, server-side.

// Fusion weights and default fan-out. These are the only tunables here; they
// live as named constants (rather than env) because this module cannot amend
// the shared env contract — the values mirror the documented RAG defaults.
const VECTOR_WEIGHT = 0.6;
const FTS_WEIGHT = 0.4;
const DEFAULT_K = 12;

export type HybridSearchOptions = {
  entityType?: string;
  k?: number;
};

// Cache the Bedrock embedding model: creating the provider resolves the AWS
// credential chain, so build it once for the process rather than per query.
let cachedEmbeddingModel: ReturnType<ReturnType<typeof createAmazonBedrock>["embedding"]> | null =
  null;

function getEmbeddingModel(): ReturnType<ReturnType<typeof createAmazonBedrock>["embedding"]> {
  if (cachedEmbeddingModel === null) {
    const env = loadEnv();
    // Resolve credentials via the AWS SDK provider chain (AWS_PROFILE / SSO /
    // assumed-role) — the Bedrock provider does not do this on its own.
    const bedrock = createAmazonBedrock({
      region: bedrockRegion(),
      credentialProvider: bedrockCredentialProvider(),
    });
    cachedEmbeddingModel = bedrock.embedding(env.EMBED_MODEL_ID);
  }
  return cachedEmbeddingModel;
}

// Embed the query with Titan Text Embeddings v2 using EXACTLY the same auth,
// dimensions, and normalize options as the ingest embed job — query and stored
// document vectors must be produced identically or cosine is meaningless.
async function embedQuery(query: string): Promise<number[]> {
  const env = loadEnv();
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: query,
    providerOptions: { bedrock: { dimensions: env.EMBED_DIMS, normalize: true } },
  });
  return embedding;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Bounded retry with exponential backoff. Bedrock on-demand embedding is
// rate-limited (ThrottlingException) under load; a couple of short retries let a
// single user query slip through when capacity is momentarily saturated. Kept
// small so the request never approaches the page's server-render budget.
async function embedQueryWithRetry(query: string, attempts = 3): Promise<number[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await embedQuery(query);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(300 * 2 ** attempt);
    }
  }
  throw lastError;
}

// Format a numeric vector as a pgvector literal string: [n,n,...].
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

type SearchRow = {
  entity_type: string;
  entity_id: string;
  title: string;
  source_url: string | null;
  score: number | string;
};

/**
 * Hybrid semantic search over entity_documents.
 *
 * One SQL fuses vector cosine similarity (`1 - (embedding <=> $vec)`) with
 * full-text rank (`ts_rank(..., websearch_to_tsquery(...))`). Both signals are
 * min-max normalized across the candidate set (via window functions) and blended
 * ~0.6 vector + 0.4 FTS. When `websearch_to_tsquery` is empty (e.g. a stopword-
 * only query) every FTS rank is 0, its normalized term coalesces to 0, and the
 * result degrades gracefully to pure vector ordering — no separate code path.
 */
// Build an OR-joined tsquery lexeme string from free text: keep alphanumeric
// terms of 3+ chars and join with ` | ` so the query matches documents sharing
// ANY significant term (recall-oriented) rather than requiring every word. The
// value is passed as a bound parameter to `to_tsquery`, so it is injection-safe;
// pure stopwords/short input yields an empty string → caller returns no rows.
export function toOrTsQuery(query: string): string {
  const terms = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return [...new Set(terms)].join(" | ");
}

// Lexical retrieval tier: rank documents purely by Postgres full-text relevance,
// with no embedding call. This is a first-class retrieval mode — selectable via
// RETRIEVAL_MODE=lexical, and the automatic tier when embeddings are unavailable
// — so semantic Q&A returns real, cited records with zero external dependencies
// (no vector index, no Bedrock). Uses OR semantics over the query terms for
// recall; an empty term set returns no rows (the caller answers "no supporting
// records" honestly).
export async function ftsSearch(query: string, opts?: HybridSearchOptions): Promise<Citation[]> {
  const k = opts?.k ?? DEFAULT_K;
  const entityType = opts?.entityType;
  const orQuery = toOrTsQuery(query);
  if (orQuery.length === 0) return [];
  const db = getDb();
  const entityFilter = entityType ? sql`and entity_type = ${entityType}` : sql``;

  const result = await db.execute(sql`
    with matched as (
      select entity_type, entity_id, title, source_url,
        ts_rank(
          to_tsvector('english', title || ' ' || body),
          to_tsquery('english', ${orQuery})
        ) as frank
      from entity_documents
      where to_tsquery('english', ${orQuery}) @@ to_tsvector('english', title || ' ' || body)
      ${entityFilter}
    )
    select entity_type, entity_id, title, source_url,
      (frank / nullif(max(frank) over (), 0)) as score
    from matched
    order by frank desc
    limit ${k}
  `);

  const rows = result.rows as SearchRow[];
  return rows.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.title,
    sourceUrl: row.source_url,
    score: Number(row.score),
  }));
}

// Vector + FTS fusion given an already-computed query embedding: one SQL blends
// normalized cosine similarity (~0.6) with normalized full-text rank (~0.4).
async function vectorFtsSearch(
  vectorLiteral: string,
  query: string,
  opts?: HybridSearchOptions
): Promise<Citation[]> {
  const k = opts?.k ?? DEFAULT_K;
  const entityType = opts?.entityType;
  const db = getDb();
  const entityFilter = entityType ? sql`and entity_type = ${entityType}` : sql``;

  const result = await db.execute(sql`
    with base as (
      select entity_type, entity_id, title, source_url,
        (embedding <=> ${vectorLiteral}::vector) as vdist,
        ts_rank(
          to_tsvector('english', title || ' ' || body),
          websearch_to_tsquery('english', ${query})
        ) as frank
      from entity_documents
      where embedding is not null
      ${entityFilter}
    ),
    scored as (
      select entity_type, entity_id, title, source_url,
        (1 - vdist) as vsim, frank
      from base
    ),
    norm as (
      select entity_type, entity_id, title, source_url,
        (vsim - min(vsim) over ()) / nullif(max(vsim) over () - min(vsim) over (), 0) as vnorm,
        (frank - min(frank) over ()) / nullif(max(frank) over () - min(frank) over (), 0) as fnorm
      from scored
    )
    select entity_type, entity_id, title, source_url,
      (${VECTOR_WEIGHT} * coalesce(vnorm, 0) + ${FTS_WEIGHT} * coalesce(fnorm, 0)) as score
    from norm
    order by score desc
    limit ${k}
  `);

  const rows = result.rows as SearchRow[];
  return rows.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.title,
    sourceUrl: row.source_url,
    score: Number(row.score),
  }));
}

// Which retrieval tier actually served a query — surfaced to the UI so the
// answer is transparent about how its evidence was found.
export type RetrievalMode = "hybrid" | "lexical";
export type RetrievalResult = { citations: Citation[]; mode: RetrievalMode };

/**
 * Tiered retrieval over entity_documents. Returns the citations and the tier that
 * served them:
 *
 *   - "hybrid" — pgvector cosine fused with Postgres full-text rank (needs an
 *     embedding + a populated vector index).
 *   - "lexical" — Postgres full-text only, no embedding call. A deliberate,
 *     always-available tier: force it with RETRIEVAL_MODE=lexical, and it also
 *     serves automatically when the embedding is unavailable. Either way the
 *     results are real, cited records — retrieval never hard-fails.
 */
export async function retrieve(query: string, opts?: HybridSearchOptions): Promise<RetrievalResult> {
  const env = loadEnv();
  if (env.RETRIEVAL_MODE === "lexical") {
    return { citations: await ftsSearch(query, opts), mode: "lexical" };
  }
  try {
    const vectorLiteral = toVectorLiteral(await embedQueryWithRetry(query));
    return { citations: await vectorFtsSearch(vectorLiteral, query, opts), mode: "hybrid" };
  } catch {
    // Embedding unavailable → serve the lexical tier. Not an error path: the
    // lexical tier is a supported retrieval mode with the same cited output.
    return { citations: await ftsSearch(query, opts), mode: "lexical" };
  }
}

// Citations-only convenience wrapper over `retrieve` (hybrid tier, lexical when
// embeddings are unavailable). Callers that need the served tier use `retrieve`.
export async function hybridSearch(query: string, opts?: HybridSearchOptions): Promise<Citation[]> {
  return (await retrieve(query, opts)).citations;
}
