import { spawnSync } from "node:child_process";
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { consolidatedPropertySchema, logger } from "@oracle/shared";

import { emptyRowSets, mapRecord, type RowSets } from "../pipeline/map-record.js";
import { sqlTableName, TABLE_ORDER, toDbRow } from "../pipeline/columns.js";

// Stage: transform every consolidated IPFS record into per-table newline JSON
// with PHYSICAL (snake_case) column names, then convert each to Parquet. The
// staged Parquet columns line up 1:1 with the Postgres tables so the bulk loader
// can `INSERT ... BY NAME` with no mapping. The backbone parquet is consumed
// as-is by the loader, so it is only referenced here (not restaged).

const FLUSH_EVERY = 500;

export type StageResult = {
  runId: string;
  stagingRoot: string;
  tablesDir: string;
  backboneParquet: string;
  consolidatedCount: number;
  skipped: number;
  rows: Record<string, number>;
};

export async function runStage(opts: {
  runId: string;
  dataDir: string;
  stagingRoot: string;
  limit: number | null;
}): Promise<StageResult> {
  const consolidatedDir = join(opts.dataDir, "consolidated");
  const backboneParquet = join(opts.dataDir, "lee-county.parquet");
  const tablesDir = join(opts.stagingRoot, "tables");
  const tmpDir = join(opts.stagingRoot, "tmp");
  await mkdir(tablesDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const allFiles = (await readdir(consolidatedDir)).filter((f) => f.endsWith(".json")).sort();
  const files = opts.limit === null ? allFiles : allFiles.slice(0, opts.limit);
  logger.info({ files: files.length, tablesDir }, "stage_started");

  const buffers = new Map<keyof RowSets, string[]>();
  const rows: Record<string, number> = {};
  let processed = 0;
  let skipped = 0;

  const flush = async (): Promise<void> => {
    for (const key of TABLE_ORDER) {
      const lines = buffers.get(key);
      if (lines === undefined || lines.length === 0) continue;
      await appendFile(join(tmpDir, `${sqlTableName(key)}.jsonl`), `${lines.join("\n")}\n`);
      lines.length = 0;
    }
  };

  for (const file of files) {
    const cid = file.replace(/\.json$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(consolidatedDir, file), "utf8"));
    } catch {
      skipped += 1;
      continue;
    }
    const result = consolidatedPropertySchema.safeParse(parsed);
    if (!result.success) {
      skipped += 1;
      continue;
    }
    const rowSets = emptyRowSets();
    mapRecord(result.data, cid, rowSets);
    for (const key of TABLE_ORDER) {
      const tableRows = rowSets[key] as Record<string, unknown>[];
      if (tableRows.length === 0) continue;
      const lines = buffers.get(key) ?? [];
      for (const row of tableRows) lines.push(JSON.stringify(toDbRow(key, row)));
      buffers.set(key, lines);
      rows[sqlTableName(key)] = (rows[sqlTableName(key)] ?? 0) + tableRows.length;
    }
    processed += 1;
    if (processed % FLUSH_EVERY === 0) await flush();
    if (processed % 10000 === 0) logger.info({ processed, total: files.length }, "stage_progress");
  }
  await flush();

  // Convert each table's JSONL to Parquet (empty tables get an empty file skipped).
  for (const key of TABLE_ORDER) {
    const name = sqlTableName(key);
    const jsonl = join(tmpDir, `${name}.jsonl`);
    const parquet = join(tablesDir, `${name}.parquet`);
    const convert = spawnSync(
      "duckdb",
      [
        "-c",
        `COPY (SELECT * FROM read_json_auto('${jsonl.replace(/'/g, "''")}')) TO '${parquet.replace(/'/g, "''")}' (FORMAT PARQUET);`,
      ],
      { encoding: "utf8" }
    );
    if (convert.status !== 0 && !convert.stderr.includes("No files found")) {
      throw new Error(`duckdb parquet conversion failed for ${name}: ${convert.stderr}`);
    }
  }
  await rm(tmpDir, { recursive: true, force: true });

  const result: StageResult = {
    runId: opts.runId,
    stagingRoot: opts.stagingRoot,
    tablesDir,
    backboneParquet,
    consolidatedCount: processed,
    skipped,
    rows,
  };
  await writeFile(join(opts.stagingRoot, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`);
  logger.info({ processed, skipped, tables: Object.keys(rows).length }, "stage_complete");
  return result;
}
