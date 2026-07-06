import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/cdk.out/**",
      "**/.next/**",
      // The web app lints with its own Next.js toolchain.
      "apps/web/**",
      // Local-only tooling directories, not part of the TS project.
      ".claude/**",
      "**/*.mjs",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Tests, CLI entrypoints, and infra synth may use console for local diagnostics.
    files: ["**/*.test.ts", "packages/ingest/src/cli/**/*.ts", "infra/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  }
);
