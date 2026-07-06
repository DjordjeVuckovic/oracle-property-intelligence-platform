import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Next only auto-loads dotenv files from the app directory. This workspace keeps
// the local secret `.env` at the repo root, so preload it here for local dev and
// build-time server rendering. Process env from the hosted runtime still wins.
const repoRootEnv = path.resolve(process.cwd(), "../..", ".env");
if (fs.existsSync(repoRootEnv)) {
  process.loadEnvFile(repoRootEnv);
}

const nextConfig: NextConfig = {
  // Self-contained server bundle for hosted SSR deploys.
  output: "standalone",
  // Workspace packages ship as TypeScript source; let Next transpile them.
  transpilePackages: ["@oracle/query", "@oracle/db", "@oracle/shared"],
  // Keep node-postgres out of the server bundle (native-ish, resolved at runtime).
  // The AI SDK + AWS credential/Bedrock stack (and its transitive @smithy/*
  // chunks) must also stay external: they reach every page transitively through
  // the `@oracle/query` barrel (which re-exports the RAG modules), and bundling
  // them into RSC vendor chunks intermittently fails to resolve in dev
  // ("Cannot find module './vendor-chunks/@smithy+core@*.js'") and bloats the
  // server bundle. Externalizing lets Node require them from node_modules at
  // runtime; `output: standalone` traces them into the deploy bundle.
  serverExternalPackages: [
    "pg",
    "pg-native",
    "ai",
    "@ai-sdk/amazon-bedrock",
    "@aws-sdk/credential-providers",
    "@smithy/core",
  ],
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // The workspace uses ESM `.js` import specifiers that point at `.ts` sources
    // (tsc "Bundler" resolution). Teach webpack to try `.ts`/`.tsx` first.
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
