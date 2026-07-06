import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Database } from "@oracle/db";
import { logger } from "@oracle/shared";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";

// Schema setup: enable pgvector (embeddings) and uuid-ossp (so the backbone
// loader computes the same UUIDv5 ids in SQL as the JS loader), then apply the
// generated Drizzle migrations. Idempotent.
export async function runMigrate(db: Database): Promise<void> {
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
  logger.info({ migrationsFolder }, "migrate_started");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await migrate(db, { migrationsFolder });
  logger.info("migrate_complete");
}
