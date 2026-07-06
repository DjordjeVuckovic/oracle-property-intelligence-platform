import pino from "pino";

// Single structured logger for CLI/ingest surfaces. Level is env-driven; no
// pretty transport is wired here so JSON lines flow cleanly to files and log
// aggregators. Never use console.* in library or pipeline code.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
});

export type Logger = typeof logger;
