import { join } from "node:path";

import { createDb, createPool, type Database } from "@oracle/db";
import { logger } from "@oracle/shared";
import type { Pool } from "pg";

import { parseIngestArgv, type IngestArgs } from "../lib/argv.js";
import { runFetch } from "../commands/fetch.js";
import { runStage } from "../commands/stage.js";
import { runMigrate } from "../commands/migrate.js";
import { runLoad } from "../commands/load.js";
import { runVerify } from "../commands/verify.js";
import { runBuildDocuments } from "../rag/build-documents.js";
import { runEmbed } from "../commands/embed.js";
import { runEmbedIndex } from "../commands/embed-index.js";

// Single entrypoint. Commands that touch the DB open one pool; file-only
// commands (fetch, stage) never connect. DB creds can come from the environment
// or --database-url / --database-ssl.
function applyDbEnv(args: IngestArgs): void {
  if (args.databaseUrl !== null) process.env.DATABASE_URL = args.databaseUrl;
  if (args.databaseSsl !== null) process.env.DATABASE_SSL = args.databaseSsl;
}

async function withDb<T>(fn: (db: Database, pool: Pool) => Promise<T>): Promise<T> {
  const pool = createPool();
  try {
    return await fn(createDb(pool), pool);
  } finally {
    await pool.end();
  }
}

async function run(): Promise<void> {
  const args = parseIngestArgv();
  const tablesDir = join(args.stagingRoot, "tables");
  const backboneParquet = join(args.dataDir, "lee-county.parquet");

  switch (args.command) {
    case "fetch":
      await runFetch({ cidFile: args.cidFile, dataDir: args.dataDir });
      return;
    case "stage":
      await runStage({
        runId: args.runId,
        dataDir: args.dataDir,
        stagingRoot: args.stagingRoot,
        limit: args.limit,
      });
      return;
    case "migrate":
      applyDbEnv(args);
      await withDb((db) => runMigrate(db));
      return;
    case "load":
      applyDbEnv(args);
      await withDb((db) => runLoad(db, { tablesDir, backboneParquet, runId: args.runId }));
      return;
    case "verify":
      applyDbEnv(args);
      await withDb((db) => runVerify(db));
      return;
    case "embed-build":
      applyDbEnv(args);
      await withDb((db) => runBuildDocuments(db));
      return;
    case "embed":
      applyDbEnv(args);
      await withDb((db) => runEmbed(db));
      return;
    case "embed-index":
      applyDbEnv(args);
      await withDb((db) => runEmbedIndex(db));
      return;
    case "all":
      applyDbEnv(args);
      await withDb(async (db) => {
        await runMigrate(db);
        await runLoad(db, { tablesDir, backboneParquet, runId: args.runId });
        await runVerify(db);
      });
      return;
  }
}

run().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "ingest_failed");
  process.exit(1);
});
