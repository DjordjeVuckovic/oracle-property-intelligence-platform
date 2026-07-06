import { createDb, createPool, type Database } from "@oracle/db";

// Lazily-created singleton pool for the app server (Next.js route handlers +
// server components). Small max so many concurrent requests don't exhaust RDS.
let cached: Database | null = null;

export function getDb(): Database {
  if (cached === null) {
    cached = createDb(createPool({ max: 8, idleTimeoutMillis: 30_000 }));
  }
  return cached;
}
