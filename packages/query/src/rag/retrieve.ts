import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { loadEnv } from "@oracle/shared";
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
let cachedEmbeddingModel: ReturnType<
  ReturnType<typeof createAmazonBedrock>["embedding"]
> | null = null;

function getEmbeddingModel(): ReturnType<
  ReturnType<typeof createAmazonBedrock>["embedding"]
> {
  if (cachedEmbeddingModel === null) {
    const env = loadEnv();
    // Resolve credentials via the AWS SDK provider chain (AWS_PROFILE / SSO /
    // assumed-role) — the Bedrock provider does not do this on its own.
    const bedrock = createAmazonBedrock({
      region: env.AWS_REGION,
      credentialProvider: fromNodeProviderChain(),
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
export async function hybridSearch(
  query: string,
  opts?: HybridSearchOptions
): Promise<Citation[]> {
  const k = opts?.k ?? DEFAULT_K;
  const entityType = opts?.entityType;

  const vectorLiteral = toVectorLiteral(await embedQuery(query));
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
