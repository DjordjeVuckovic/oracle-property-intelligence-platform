# Oracle Property Intelligence Platform — Agent Guidance

Property-intelligence platform over Lee County public records: canonical, provenance-tracked entities (properties, owners, tenants, businesses, contractors, permits) with exploration views and source-cited natural-language Q&A.

## Hard rules

- Production data is the real Oracle open-data export. Never seed, mock, or fabricate records or provenance — fixtures are for tests only.
- Every entity and relationship carries provenance: source system, source URL/record key, collection + refresh timestamps.
- Every answer from the Q&A layer is source-backed. No retrieved record, no claim.
- The app deploys to a public hosted URL; no feature is done until it works there.
- Do not touch gated surfaces: the Neon `elephant-query-db` `DATABASE_URL`, the oracle-node S3 bucket, the permit-harvest SQS queue.
- Reuse before rebuilding. Prefer elephant-xyz packages and code over reimplementing: the `elephant-query-db` schema/loaders/normalizers, `lexicon` JSON schemas, oracle-node harvesters/transformers, kit helpers (`normalizeParcelIdentifier()`). Never duplicate logic that already exists in those repos — import or port it, with a source pointer.

## Data

Public IPFS, no credentials:

- **Query-table Parquet** (backbone, 229 MB, 37 cols, 511,695 rows):
  `https://ipfs.filebase.io/ipns/k51qzi5uqu5djd4ohcf3qm87dhlt0e270xw8ejhkyia62edr76uj0u05hrf7m5`
  Coverage: 26,965 properties with permits (175,594 permits), 42,407 with Sunbiz tenants, 8,664 with BBB contractors, 410,076 distinct owners. `property_cid` links each row to its full record.
- **Consolidated per-property JSON**: `https://ipfs.io/ipfs/<property_cid>`. 23 top-level keys — flattened appraiser data plus `permits[]`, `sunbizTenants[]`, `bbbProfiles[]` (reviews, complaints, quality scores), `collectedAt`.
- **Shard index**: IPNS `k51qzi5uqu5dlzgslzedrnk4whtd7ip69l0pmd3zxelz8hwjorbeyy0pyyeu4m` → `index.json` → 52 shards.
- Gateways 429 under load: download once, query locally; bounded concurrency + gateway rotation (`ipfs.io`, `dweb.link`, `w3s.link`, `ipfs.filebase.io`). Bulk-fetch only the enriched subset (~70k CIDs), not all 511k.

## Schema

- Base model = the Drizzle schema in `elephant-xyz/elephant-query-db` (`src/schema/*.ts`, `migrations/`). Its consolidation export defines the IPFS record shape. Replicate the profile/search views.
- Lexicon source of truth: `elephant-xyz/lexicon` — `src/data/lexicon.json` + `tests/static-json-schemas/*.json`; the **County** data group is the property graph; relationships are `<from>_to_<to>` edges.
- Lexicon extensions (document each): Reviews/Complaints (from `bbbProfiles`), Owners (`person`/`company` + `ownership`), Tenants (Sunbiz matches), Contractors (`company` + `contractor_license`).
- The Lexicon `project` class is CRM, not construction — permits and renovations map to `property_improvement`.

## Gotchas

- Permits = `property_improvements`. There is no table literally named `permits`; child rows (inspections, contacts, fees, events) join on `property_improvement_id`.
- `parcel_identifier` is digits-only. Normalize user input (`value.replace(/\D/g, '')`) before matching — the kit ships `normalizeParcelIdentifier()`.
- "Tenant" is inferred, not stored — a Sunbiz business registered at the property's address. Occupancy is derived; say so in the UI rather than promising residential-tenant data.
- BBB is company-scoped, not property-scoped — reach it through the permit's contractor company (`property_improvements.contractor_company_id` → `companies` → `business_reputation_profiles`).
- Verify MCP scale before trusting it: `getOracleDatasetInfo` must report ~511,695 Lee properties; a misconfigured install serves a stale ~4,664-property manifest.
- Prefer the four views (`property_profile_view`, `permit_search_view`, `company_profile_view`, `address_profile_view`) for search pages; drop to `source_payload` only for fields not yet promoted to typed columns.

## Stack

- Turborepo + pnpm workspaces: `apps/web` (Next.js frontend, Amplify Hosting), `apps/api` (tRPC on Lambda behind API Gateway HTTP API v2), `packages/db` (Drizzle schema + migrations), `packages/ingest` (resumable CLI pipeline), `packages/shared` (Zod contracts, filter grammar).
- AWS `us-east-2`, CDK is the only IaC (`cdk deploy`; every resource tagged `project_name`): RDS Postgres 16 + pgvector, API stack, Amplify app, Secrets Manager for DB/LLM credentials. pgvector instead of the kit's OpenSearch RAG store is a cost-driven, documented deviation.
- TypeScript ESM, strict; no `any`/`as any`. Zod validates env, config, and API inputs (tRPC input schemas).
- No hardcoded values. Every tunable — model ids, embedding dims, thresholds, batch sizes, concurrency, gateway lists, IPNS names, connection settings — lives in Zod-validated env/config with a documented default in `.env.example`; secrets only via env/Secrets Manager, never in code or logs. New behavior and risky paths ship behind env-driven feature flags (default off/safe), not commented-out code.
- Drizzle over Postgres. Deterministic UUIDv5 IDs keyed on source identifiers; ingestion is idempotent.
- LLM + embeddings only through the Vercel AI SDK (`ai` + `@ai-sdk/amazon-bedrock`): Titan Text Embeddings v2 for vectors, Bedrock Claude for cited answers; direct provider SDKs are forbidden.
- Retrieval is hybrid (pgvector cosine + Postgres FTS); citations carry entity id, source URL, score.
- Canonical inquiries are deterministic SQL routed from natural language; RAG is the semantic fallback.
- Views: Property, Tenant, Business, Contractor + inquiry runner + Q&A. Every entity page deep-linkable; semantic markup, no bot-hostile guards.
- Powertools Logger/Tracer/Metrics on API Lambdas (no `console.log`); Vitest colocated `*.test.ts`; `aws-sdk-client-mock`; Prettier + ESLint.

## Testing

- No flaky tests — deterministic by construction. Inject clocks (fake timers), seed or eliminate randomness, mock every I/O boundary (`aws-sdk-client-mock` for AWS, AI SDK mock provider for LLM/embeddings, fixtures for IPFS payloads).
- No sleeps, no wall-clock or duration assertions, no order-dependent tests; every test builds its own fresh state.
- Assert exact behavior and values. Never assert counts/sizes of variable data (live datasets, LLM output length).
- Network-touching tests (live IPFS, live DB) are opt-in behind env flags and excluded from CI. The Phase-2 non-empty inquiry checks run against the loaded DB as a verification script, not as CI unit tests.

## Verification

1. `pnpm test`, `pnpm lint`, `pnpm typecheck`.
2. All 24 canonical inquiries (`README.md`) return non-empty results; row counts match the coverage numbers above.
3. Provenance links on touched entities resolve.
4. Exercise the change on the deployed runtime, not localhost.

## Commits

Conventional commits, lowercase subjects (`feat:`, `fix:`, `docs:`, `chore:`).

## References

- `README.md` — product requirements and canonical inquiries.
- `elephant-xyz/{elephant-query-db,lexicon,oracle-node,skills,elephant-mcp}`; source-URL registry in `oracle-node/docs/lee-county-sources.yaml`.
- Engineering baseline: `soofi-xyz/soofi-xyz-team-kit` → `skills/apply-engineering-guidelines/`.
