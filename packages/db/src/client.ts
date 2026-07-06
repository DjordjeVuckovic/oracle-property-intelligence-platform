import { databaseUrlFromEnv, loadEnv } from "@oracle/shared";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

// Build a pg Pool + Drizzle client from env. SSL mode is env-driven: `require`
// (RDS) enables TLS; `disable` is for local Postgres only. rejectUnauthorized is
// relaxed because RDS presents an AWS-managed CA chain rather than a public one.
export function createPool(overrides: Partial<PoolConfig> = {}): Pool {
  const env = loadEnv();
  return new Pool({
    connectionString: databaseUrlFromEnv(env),
    ssl: env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : false,
    application_name: "oracle-property-intelligence",
    ...overrides,
  });
}

export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema });
}
