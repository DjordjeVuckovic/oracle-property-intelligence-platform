import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship as TypeScript source; let Next transpile them.
  transpilePackages: ["@oracle/query", "@oracle/db", "@oracle/shared"],
  // Keep node-postgres out of the server bundle (native-ish, resolved at runtime).
  serverExternalPackages: ["pg", "pg-native"],
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
