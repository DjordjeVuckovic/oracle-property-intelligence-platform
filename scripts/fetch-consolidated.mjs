#!/usr/bin/env node
// Resumable bulk fetch of consolidated per-property JSON records from IPFS.
//
// Gateway-rotation approach ported from elephant-mcp/src/lib/ipfs.ts
// (fetchFromIpfs); the concurrency pool, exponential backoff, and on-disk
// resumable ledger are new orchestration — no bulk IPFS fetcher exists upstream.
//
// Reads a newline-delimited CID list, writes each record to
// <dataDir>/consolidated/<cid>.json, and skips CIDs already on disk so the
// process is safe to re-run after an interruption. All tunables come from env
// with documented defaults (mirrors .env.example).

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const env = process.env;
const DATA_DIR = env.INGEST_DATA_DIR ?? ".data";
const CID_FILE = env.INGEST_CID_FILE ?? join(DATA_DIR, "enriched-cids.txt");
const OUT_DIR = join(DATA_DIR, "consolidated");
const GATEWAYS = (
  env.IPFS_GATEWAYS ??
  "https://ipfs.io,https://dweb.link,https://w3s.link,https://ipfs.filebase.io"
)
  .split(",")
  .map((g) => g.trim())
  .filter(Boolean);
const CONCURRENCY = Number(env.INGEST_FETCH_CONCURRENCY ?? 12);
const RETRIES = Number(env.INGEST_FETCH_RETRIES ?? 5);
const BACKOFF_MS = Number(env.INGEST_FETCH_BACKOFF_MS ?? 2000);
const TIMEOUT_MS = Number(env.INGEST_FETCH_TIMEOUT_MS ?? 60000);
const LEDGER = join(DATA_DIR, "fetch-failures.log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(event, fields) {
  process.stdout.write(JSON.stringify({ event, ...fields }) + "\n");
}

// A fetched record must be JSON with the consolidated shape's anchor keys.
function isValidRecord(text) {
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" && "parcelId" in obj && "collectedAt" in obj;
  } catch {
    return false;
  }
}

async function fetchOne(cid) {
  const outPath = join(OUT_DIR, `${cid}.json`);
  if (existsSync(outPath) && statSync(outPath).size > 0) return "skipped";

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    // Rotate the starting gateway by attempt so a slow/limited gateway does not
    // dominate retries for a given CID.
    for (let g = 0; g < GATEWAYS.length; g++) {
      const gateway = GATEWAYS[(attempt + g) % GATEWAYS.length];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${gateway}/ipfs/${cid}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) continue;
        if (!res.ok) continue;
        const text = await res.text();
        if (!isValidRecord(text)) continue;
        await writeFile(outPath, text);
        return "fetched";
      } catch {
        clearTimeout(timer);
        continue;
      }
    }
    // All gateways exhausted this round — exponential backoff before retrying.
    await sleep(BACKOFF_MS * Math.pow(2, attempt));
  }
  return "failed";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const raw = await readFile(CID_FILE, "utf8");
  const cids = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  log("fetch_started", { total: cids.length, gateways: GATEWAYS, concurrency: CONCURRENCY });

  const failures = createWriteStream(LEDGER, { flags: "a" });
  const counts = { fetched: 0, skipped: 0, failed: 0 };
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < cids.length) {
      const cid = cids[next++];
      const result = await fetchOne(cid);
      counts[result] = (counts[result] ?? 0) + 1;
      if (result === "failed") failures.write(cid + "\n");
      done++;
      if (done % 500 === 0) {
        log("fetch_progress", {
          done,
          total: cids.length,
          fetched: counts.fetched,
          skipped: counts.skipped,
          failed: counts.failed,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  failures.end();
  log("fetch_complete", { ...counts, total: cids.length });
}

main().catch((err) => {
  log("fetch_error", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
