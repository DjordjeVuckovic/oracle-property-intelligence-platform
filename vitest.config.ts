import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Resolve workspace packages to their TypeScript sources so tests run without a
// build step. Mirrors the `paths` mapping in tsconfig.base.json.
export default defineConfig({
  resolve: {
    alias: {
      "@oracle/shared": resolve("./packages/shared/src/index.ts"),
      "@oracle/db": resolve("./packages/db/src/index.ts"),
      "@oracle/ingest": resolve("./packages/ingest/src/index.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "infra/**/*.test.ts"],
    // Live-network tests (IPFS, DB) opt in via env flags and are excluded from CI.
    exclude: ["**/node_modules/**", "**/dist/**", "**/cdk.out/**"],
    coverage: {
      provider: "v8",
      include: ["packages/**/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/*.d.ts"],
    },
  },
});
