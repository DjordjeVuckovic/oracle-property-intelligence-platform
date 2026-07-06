export type IngestCommand = "stage-ipfs" | "load-staging" | "verify-critical" | "full";

export type IngestArgs = {
  readonly command: IngestCommand;
  readonly runId: string;
  readonly dataDir: string;
  readonly stagingDir: string;
  readonly databaseUrl: string | null;
  readonly databaseSsl: "require" | "disable";
  readonly limit: number | null;
  readonly workers: number;
};

function defaultRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function takeValue(argv: string[], index: number): { value: string; nextIndex: number } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return { value, nextIndex: index + 1 };
}

export function parseIngestArgv(argv = process.argv.slice(2)): IngestArgs {
  while (argv[0] === "--") {
    argv = argv.slice(1);
  }

  const commandArg = argv[0];
  if (commandArg === undefined) {
    throw new Error("Missing ingest command. Use stage-ipfs, load-staging, verify-critical, or full.");
  }

  const command = commandArg as IngestCommand;
  if (!["stage-ipfs", "load-staging", "verify-critical", "full"].includes(command)) {
    throw new Error(`Unknown ingest command: ${commandArg}`);
  }

  let runId = defaultRunId();
  let dataDir = process.env.INGEST_DATA_DIR ?? ".data";
  let stagingDir = `${dataDir}/staging/${runId}`;
  let databaseUrl = process.env.DATABASE_URL ?? null;
  let databaseSsl: "require" | "disable" = (process.env.DATABASE_SSL as "require" | "disable" | undefined) ?? "require";
  let limit: number | null = null;
  let workers = Number(process.env.INGEST_STAGE_WORKERS ?? 6);

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--run-id") {
      const next = takeValue(argv, i);
      runId = next.value;
      stagingDir = `${dataDir}/staging/${runId}`;
      i = next.nextIndex;
      continue;
    }
    if (arg === "--data-dir") {
      const next = takeValue(argv, i);
      dataDir = next.value;
      stagingDir = `${dataDir}/staging/${runId}`;
      i = next.nextIndex;
      continue;
    }
    if (arg === "--staging-dir") {
      const next = takeValue(argv, i);
      stagingDir = next.value;
      i = next.nextIndex;
      continue;
    }
    if (arg === "--database-url") {
      const next = takeValue(argv, i);
      databaseUrl = next.value;
      i = next.nextIndex;
      continue;
    }
    if (arg === "--database-ssl") {
      const next = takeValue(argv, i);
      if (next.value !== "require" && next.value !== "disable") {
        throw new Error(`Invalid --database-ssl value: ${next.value}`);
      }
      databaseSsl = next.value;
      i = next.nextIndex;
      continue;
    }
    if (arg === "--limit") {
      const next = takeValue(argv, i);
      limit = Number(next.value);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value: ${next.value}`);
      }
      i = next.nextIndex;
      continue;
    }
    if (arg === "--workers") {
      const next = takeValue(argv, i);
      workers = Number(next.value);
      if (!Number.isFinite(workers) || workers <= 0) {
        throw new Error(`Invalid --workers value: ${next.value}`);
      }
      i = next.nextIndex;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: ingest <stage-ipfs|load-staging|verify-critical|full> [--run-id ID] [--data-dir DIR] [--staging-dir DIR] [--database-url URL] [--database-ssl require|disable] [--limit N] [--workers N]");
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return {
    command,
    runId,
    dataDir,
    stagingDir,
    databaseUrl,
    databaseSsl,
    limit,
    workers,
  };
}
