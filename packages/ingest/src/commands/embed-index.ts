import type { Database } from "@oracle/db";
import { logger } from "@oracle/shared";
import { sql } from "drizzle-orm";

// Build the pgvector HNSW cosine index over the document embeddings. Run after
// the first embed pass; safe to re-run (IF NOT EXISTS). The FTS gin index is
// already created by the schema migration, so retrieval is hybrid-ready once
// this exists.
export async function runEmbedIndex(db: Database): Promise<void> {
  logger.info("embed_index_started");
  await db.execute(
    sql`create index if not exists entity_documents_embedding_hnsw
        on entity_documents using hnsw (embedding vector_cosine_ops)`
  );
  logger.info("embed_index_complete");
}
