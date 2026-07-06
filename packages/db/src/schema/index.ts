// Base schema (shared/core/appraisal/permits/sunbiz/bbb/views) is ported
// verbatim from elephant-xyz/elephant-query-db @ b9b8115 (src/schema/*.ts) — it
// IS the Elephant Lexicon applied to the Oracle Lee County export, and the
// consolidated IPFS record maps 1:1 onto it. See packages/db/SOURCES.md for the
// provenance and the exact upstream commit. Do not hand-edit the ported files;
// platform-specific tables live in ./extensions.ts.
export * from "./shared.js";
export * from "./core.js";
export * from "./appraisal.js";
export * from "./permits.js";
export * from "./sunbiz.js";
export * from "./bbb.js";
export * from "./views.js";
export * from "./extensions.js";
