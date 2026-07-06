import { z } from "zod";

// Central env contract. Every tunable in the platform is declared here with a
// documented default (mirrors .env.example); nothing is hardcoded at a call
// site. Secrets (DATABASE_URL) have no default and must be provided.

const csv = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["require", "disable"]).default("require"),

  ORACLE_QUERY_TABLE_IPNS: z
    .string()
    .default("k51qzi5uqu5djd4ohcf3qm87dhlt0e270xw8ejhkyia62edr76uj0u05hrf7m5"),
  ORACLE_SHARD_INDEX_IPNS: z
    .string()
    .default("k51qzi5uqu5dlzgslzedrnk4whtd7ip69l0pmd3zxelz8hwjorbeyy0pyyeu4m"),
  IPFS_GATEWAYS: z
    .string()
    .default("https://ipfs.io,https://dweb.link,https://w3s.link,https://ipfs.filebase.io")
    .transform(csv),

  INGEST_DATA_DIR: z.string().default(".data"),
  INGEST_PARQUET_FILE: z.string().default("lee-county.parquet"),
  INGEST_FETCH_CONCURRENCY: z.coerce.number().int().positive().default(12),
  INGEST_FETCH_RETRIES: z.coerce.number().int().positive().default(5),
  INGEST_FETCH_BACKOFF_MS: z.coerce.number().int().positive().default(2000),
  INGEST_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  INGEST_LOAD_BATCH_SIZE: z.coerce.number().int().positive().default(1000),
  INGEST_STAGE_WORKERS: z.coerce.number().int().positive().default(6),

  // --- Bedrock (embeddings + answers), via the Vercel AI SDK ---
  AWS_REGION: z.string().default("us-east-2"),
  EMBED_MODEL_ID: z.string().default("amazon.titan-embed-text-v2:0"),
  // Titan v2 supports 256/512/1024; must equal the entity_documents.embedding
  // column dimension. 512 is the cost/quality sweet spot for this corpus.
  EMBED_DIMS: z.coerce.number().int().positive().default(512),
  // Docs pulled + written per round; each round issues one bulk UPDATE.
  EMBED_BATCH: z.coerce.number().int().positive().default(192),
  // Parallel Titan calls in flight (Titan embeds one input per call).
  EMBED_CONCURRENCY: z.coerce.number().int().positive().default(8),
  ANSWER_MODEL_ID: z.string().default("anthropic.claude-sonnet-4-6"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

// Parse once and cache. Throws a readable aggregate error if anything is missing
// or malformed, so misconfiguration fails fast at startup rather than mid-run.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
