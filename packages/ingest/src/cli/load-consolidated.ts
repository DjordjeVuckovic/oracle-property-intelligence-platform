import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPool, createDb, schema } from "@oracle/db";
import { consolidatedPropertySchema, loadEnv, logger } from "@oracle/shared";
import { eq, sql } from "drizzle-orm";

import { emptyRowSets, mapRecord } from "../pipeline/map-record.js";
import { BatchLoader } from "../pipeline/load.js";

// Transform + load stage: read every fetched consolidated record from disk,
// validate it against the Zod contract, invert it into rows, and batch-upsert.
// Idempotent (deterministic ids + ON CONFLICT DO NOTHING); safe to re-run.
async function main(): Promise<void> {
  const env = loadEnv();
  const dir = join(env.INGEST_DATA_DIR, "consolidated");
  const pool = createPool();
  const db = createDb(pool);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  logger.info({ files: files.length, dir }, "load_consolidated_started");

  const [run] = await db
    .insert(schema.ingestionRuns)
    .values({
      stage: "load_consolidated",
      sourceSystem: "oracle-open-data",
      sourceUri: `ipfs://consolidated/${files.length}`,
    })
    .returning({ id: schema.ingestionRuns.ingestionRunId });
  const runId = run!.id;

  const loader = new BatchLoader(db, env.INGEST_LOAD_BATCH_SIZE);
  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    const cid = file.replace(/\.json$/, "");
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch {
      skipped += 1;
      continue;
    }
    const parsed = consolidatedPropertySchema.safeParse(raw);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const rows = emptyRowSets();
    mapRecord(parsed.data, cid, rows);
    loader.add(rows);
    await loader.maybeFlush();
    processed += 1;
    if (processed % 5000 === 0) {
      logger.info({ processed, skipped, total: files.length }, "load_progress");
    }
  }

  await loader.flush();
  const counts = { ...loader.totals(), processed, skipped };
  await db
    .update(schema.ingestionRuns)
    .set({ status: "complete", counts, finishedAt: sql`now()` })
    .where(eq(schema.ingestionRuns.ingestionRunId, runId));

  await pool.end();
  logger.info({ counts }, "load_consolidated_complete");
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "load_consolidated_failed");
  process.exit(1);
});
