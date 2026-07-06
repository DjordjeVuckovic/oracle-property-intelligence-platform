import { join } from "node:path";

// One coherent CLI surface. The pipeline is: fetch → stage → migrate → load →
// verify, then embed-build → embed → embed-index for RAG. `all` runs
// migrate+load+verify against an already-staged run.
export const COMMANDS = [
  "fetch",
  "stage",
  "migrate",
  "load",
  "verify",
  "embed-build",
  "embed",
  "embed-index",
  "all",
] as const;

export type IngestCommand = (typeof COMMANDS)[number];

export type IngestArgs = {
  readonly command: IngestCommand;
  readonly runId: string;
  readonly dataDir: string;
  readonly stagingRoot: string;
  readonly cidFile: string;
  readonly limit: number | null;
  readonly databaseUrl: string | null;
  readonly databaseSsl: "require" | "disable" | null;
};

const FLAGS = new Set([
  "--run-id",
  "--data-dir",
  "--staging-dir",
  "--cid-file",
  "--limit",
  "--database-url",
  "--database-ssl",
]);

function takeValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || FLAGS.has(value)) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

export function parseIngestArgv(argv: string[] = process.argv.slice(2)): IngestArgs {
  while (argv[0] === "--") argv = argv.slice(1);

  const command = argv[0] as IngestCommand;
  if (command === undefined || !COMMANDS.includes(command)) {
    throw new Error(`Usage: ingest <${COMMANDS.join("|")}> [flags]`);
  }

  const raw = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === undefined) continue;
    if (!FLAGS.has(flag)) throw new Error(`Unknown flag: ${flag}`);
    raw.set(flag, takeValue(argv, i));
    i += 1;
  }

  const dataDir = raw.get("--data-dir") ?? process.env.INGEST_DATA_DIR ?? ".data";
  // Timestamp-based default; a fixed id (e.g. --run-id rds-1) makes a run resumable.
  const runId = raw.get("--run-id") ?? `run-${Date.now()}`;
  const stagingRoot = raw.get("--staging-dir") ?? join(dataDir, "staging", runId);
  const limitRaw = raw.get("--limit");
  const limit = limitRaw === undefined ? null : Number(limitRaw);
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit: ${limitRaw}`);
  }
  const ssl = raw.get("--database-ssl");
  if (ssl !== undefined && ssl !== "require" && ssl !== "disable") {
    throw new Error(`Invalid --database-ssl: ${ssl}`);
  }

  return {
    command,
    runId,
    dataDir,
    stagingRoot,
    cidFile: raw.get("--cid-file") ?? join(dataDir, "enriched-cids.txt"),
    limit,
    databaseUrl: raw.get("--database-url") ?? null,
    databaseSsl: ssl ?? null,
  };
}
