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

const HELP = `oracle ingest — resumable IPFS -> Postgres pipeline for the Lee County Oracle export.

Usage:
  pnpm --filter @oracle/ingest ingest -- <command> [flags]

Commands:
  fetch         download the consolidated per-property JSON from IPFS (file-only)
  stage         normalize fetched records into staging tables (file-only)
  migrate       apply database migrations
  load          load staged tables + the parquet backbone into Postgres
  verify        check row counts / invariants against the loaded DB
  embed-build   build RAG documents from the reconciled graph
  embed         generate embeddings (Bedrock Titan v2)
  embed-index   build the pgvector index
  all           migrate + load + verify (against an already-staged run)

Flags:
  --run-id <id>                    fixed id makes a run resumable (default: run-<timestamp>)
  --data-dir <path>                default .data (or INGEST_DATA_DIR)
  --staging-dir <path>             default <data-dir>/staging/<run-id>
  --cid-file <path>                CID list for fetch
  --limit <n>                      cap records processed
  --database-url <url>             overrides DATABASE_URL
  --database-ssl <require|disable> pg TLS mode
`;

function wantsHelp(argv: string[]): boolean {
  const rest = argv.filter((a) => a !== "--");
  return rest.length === 0 || rest.includes("--help") || rest.includes("-h");
}

async function run(): Promise<void> {
  if (wantsHelp(process.argv.slice(2))) {
    process.stdout.write(HELP);
    return;
  }

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
