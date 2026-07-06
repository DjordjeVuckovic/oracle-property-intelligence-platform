import { defineConfig } from "drizzle-kit";

// Mirrors elephant-query-db's drizzle config (snake_case casing so the ported
// schema's column names match the upstream migrations). DATABASE_URL is required
// at generate/migrate time; there is no baked-in default so a stray migration
// can never run against the wrong database.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
