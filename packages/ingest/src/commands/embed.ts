import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { Database } from "@oracle/db";
import { loadEnv, logger } from "@oracle/shared";
import { embedMany } from "ai";
import { sql } from "drizzle-orm";

// Embed entity_documents with Bedrock Titan Text Embeddings v2 via the Vercel AI
// SDK (direct provider SDKs are forbidden). Resumable by construction: the
// `embedding IS NULL` predicate is the ledger, so re-running only fills gaps and
// a rebuilt document (embedding reset to null) is re-embedded automatically.
export async function runEmbed(db: Database): Promise<number> {
  const env = loadEnv();
  // Resolve credentials via the AWS SDK provider chain so profile/SSO/assumed-role
  // (e.g. AWS_PROFILE) work — the Bedrock provider does not do this on its own.
  const bedrock = createAmazonBedrock({
    region: env.AWS_REGION,
    credentialProvider: fromNodeProviderChain(),
  });
  const model = bedrock.embedding(env.EMBED_MODEL_ID);

  let embedded = 0;
  for (;;) {
    const batch = await db.execute(
      sql`select document_id, title, body from entity_documents where embedding is null limit ${env.EMBED_BATCH}`
    );
    if (batch.rows.length === 0) break;

    const rows = batch.rows as { document_id: string; title: string; body: string }[];
    const { embeddings } = await embedMany({
      model,
      values: rows.map((r) => `${r.title}\n${r.body}`),
      maxParallelCalls: env.EMBED_CONCURRENCY,
      // Titan v2 returns 1024 dims unless asked; request the configured size so
      // the vectors match the entity_documents.embedding column.
      providerOptions: { bedrock: { dimensions: env.EMBED_DIMS, normalize: true } },
    });

    for (let i = 0; i < rows.length; i++) {
      const vector = `[${embeddings[i]!.join(",")}]`;
      await db.execute(
        sql`update entity_documents set embedding = ${vector}::vector, updated_at = now()
            where document_id = ${rows[i]!.document_id}`
      );
    }
    embedded += rows.length;
    logger.info({ embedded }, "embed_progress");
  }
  logger.info({ embedded }, "embed_complete");
  return embedded;
}
