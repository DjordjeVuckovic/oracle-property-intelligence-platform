import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPool, createDb } from "@oracle/db";
import { logger } from "@oracle/shared";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";

// One-time schema setup: enable required extensions (pgvector for embeddings,
// uuid-ossp so the backbone loader can compute the same UUIDv5 ids in SQL that
// the JS loader computes), then apply the generated Drizzle migrations.
async function main(): Promise<void> {
  const pool = createPool();
  const db = createDb(pool);
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

  logger.info("ensuring extensions");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  logger.info({ migrationsFolder }, "applying migrations");
  await migrate(db, { migrationsFolder });

  await pool.end();
  logger.info("migrate complete");
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "migrate failed");
  process.exit(1);
});
