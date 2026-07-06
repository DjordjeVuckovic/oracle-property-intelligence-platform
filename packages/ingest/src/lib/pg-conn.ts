import { databaseUrlFromEnv, loadEnv } from "@oracle/shared";

// Parse DATABASE_URL into libpq connection parameters so the duckdb postgres
// extension can ATTACH the same database. The password is passed to the duckdb
// child via PGPASSWORD (env), never inlined into the connection string or argv.
export type PgConn = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslmode: "require" | "disable";
};

export function pgConn(): PgConn {
  const env = loadEnv();
  const url = new URL(databaseUrlFromEnv(env));
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "oracle",
    sslmode: env.DATABASE_SSL,
  };
}

// libpq keyword/value string WITHOUT the password (duckdb reads PGPASSWORD from
// the environment we hand its child process).
export function duckdbAttachDsn(conn: PgConn): string {
  return [
    `host=${conn.host}`,
    `port=${conn.port}`,
    `user=${conn.user}`,
    `dbname=${conn.database}`,
    `sslmode=${conn.sslmode}`,
  ].join(" ");
}

// Environment for a duckdb child process so its postgres ATTACH authenticates.
export function duckdbEnv(conn: PgConn): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: conn.password };
}
