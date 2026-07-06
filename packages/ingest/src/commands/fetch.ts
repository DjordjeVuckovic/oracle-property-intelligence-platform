import { createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadEnv, logger } from "@oracle/shared";

// Fetch: resumable bulk download of consolidated per-property JSON from IPFS.
// Gateway-rotation approach ported from elephant-mcp/src/lib/ipfs.ts; the
// concurrency pool, exponential backoff, and on-disk resume (skip CIDs already
// written) are the orchestration around it. Reads a newline-delimited CID list.

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// A valid record is JSON carrying the consolidated shape's anchor keys.
function isValidRecord(text: string): boolean {
  try {
    const obj: unknown = JSON.parse(text);
    return typeof obj === "object" && obj !== null && "parcelId" in obj && "collectedAt" in obj;
  } catch {
    return false;
  }
}

export async function runFetch(opts: { cidFile: string; dataDir: string }): Promise<void> {
  const env = loadEnv();
  const outDir = join(opts.dataDir, "consolidated");
  await mkdir(outDir, { recursive: true });

  const cids = (await readFile(opts.cidFile, "utf8"))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  logger.info(
    { total: cids.length, gateways: env.IPFS_GATEWAYS, concurrency: env.INGEST_FETCH_CONCURRENCY },
    "fetch_started"
  );

  const failures = createWriteStream(join(opts.dataDir, "fetch-failures.log"), { flags: "a" });
  const counts = { fetched: 0, skipped: 0, failed: 0 };
  let next = 0;
  let done = 0;

  const fetchOne = async (cid: string): Promise<"fetched" | "skipped" | "failed"> => {
    const outPath = join(outDir, `${cid}.json`);
    if (existsSync(outPath) && statSync(outPath).size > 0) return "skipped";
    for (let attempt = 0; attempt < env.INGEST_FETCH_RETRIES; attempt++) {
      for (let g = 0; g < env.IPFS_GATEWAYS.length; g++) {
        const gateway = env.IPFS_GATEWAYS[(attempt + g) % env.IPFS_GATEWAYS.length];
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), env.INGEST_FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(`${gateway}/ipfs/${cid}`, { signal: ctrl.signal });
          clearTimeout(timer);
          if (res.status === 429 || res.status >= 500 || !res.ok) continue;
          const text = await res.text();
          if (!isValidRecord(text)) continue;
          await writeFile(outPath, text);
          return "fetched";
        } catch {
          clearTimeout(timer);
        }
      }
      await sleep(env.INGEST_FETCH_BACKOFF_MS * Math.pow(2, attempt));
    }
    return "failed";
  };

  const worker = async (): Promise<void> => {
    while (next < cids.length) {
      const cid = cids[next++]!;
      const result = await fetchOne(cid);
      counts[result] += 1;
      if (result === "failed") failures.write(`${cid}\n`);
      done += 1;
      if (done % 500 === 0) logger.info({ done, total: cids.length, ...counts }, "fetch_progress");
    }
  };

  await Promise.all(Array.from({ length: env.INGEST_FETCH_CONCURRENCY }, worker));
  failures.end();
  logger.info({ ...counts, total: cids.length }, "fetch_complete");
}
