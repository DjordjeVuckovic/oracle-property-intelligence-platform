import { z } from "zod";

// Central env contract. Every tunable in the platform is declared here with a
// documented default (mirrors .env.example); nothing is hardcoded at a call
// site. The database may be provided as a local DATABASE_URL or as discrete
// hosted-runtime parts so passwords can stay in Secrets Manager.

const csv = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().min(1).optional()
);

export const envSchema = z
  .object({
    DATABASE_URL: optionalNonEmptyString,
    DATABASE_HOST: optionalNonEmptyString,
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_NAME: z.string().min(1).default("oracle"),
    DATABASE_USER: z.string().min(1).default("oracle"),
    DATABASE_PASSWORD: optionalNonEmptyString,
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
    // Cross-region inference-profile id (the plain `anthropic.claude-sonnet-4-6`
    // is INFERENCE_PROFILE-only and rejects on-demand InvokeModel).
    ANSWER_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-6"),

    // --- Cross-account Bedrock (optional; single-account by default) ---
    // When the app's own account has no on-demand Bedrock quota, point Bedrock at
    // a Bedrock-enabled account: the app's ambient identity (App Runner instance
    // role in prod, AWS_PROFILE/SSO in dev) assumes BEDROCK_ASSUME_ROLE_ARN and
    // invokes there, billed to that account. Leave it unset to use the app
    // account's own Bedrock — unset it to switch back once local quota is granted.
    BEDROCK_ASSUME_ROLE_ARN: optionalNonEmptyString,
    // Optional sts:ExternalId, if the target role's trust policy requires one.
    BEDROCK_ASSUME_ROLE_EXTERNAL_ID: optionalNonEmptyString,
    // Region for model calls only (defaults to AWS_REGION). The cross-account
    // target may have model access in a different region than the app/DB.
    BEDROCK_REGION: optionalNonEmptyString,

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE_URL ?? (env.DATABASE_HOST && env.DATABASE_PASSWORD)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "Set DATABASE_URL or DATABASE_HOST plus DATABASE_PASSWORD",
    });
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

export function databaseUrlFromEnv(env: Env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const password = encodeURIComponent(env.DATABASE_PASSWORD ?? "");
  return `postgres://${env.DATABASE_USER}:${password}@${env.DATABASE_HOST}:${env.DATABASE_PORT}/${env.DATABASE_NAME}`;
}
