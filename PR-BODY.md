# feat: oracle property intelligence platform — live runtime, 24 inquiries, cited Q&A

## Live hosted runtime

**https://2vpmrwfxgv.us-east-2.awsapprunner.com** — deployed on AWS App Runner, public, no login, nothing to install.

- **Four exploration views** — Property, Tenant, Business, Contractor — each backed by real Lee County records with linked source provenance.
- **27 one-click inquiries** (`/insights`) — the 24 required demo inquiries plus 3 stretch, every one returning real rows with a citation per row.
- **Natural-language Q&A** (`/ask`) — plain-English questions answered strictly from retrieved records, each answer cited to a resolvable source.
- **Provenance ledger** (`/sources`) — per-source record counts and the ingestion-run history for the loaded dataset.

## Summary

**What it does:** ingests the real Oracle open-data export for Lee County, reconciles it into one canonical, provenance-tracked entity graph on the Elephant Lexicon, indexes it for both structured and semantic retrieval, and exposes it through four exploration views, a one-click inquiry runner, and a source-cited Q&A layer.

**The data is real, at scale, end to end.** Nothing is seeded, mocked, or fabricated in production. Loaded and visible on `/sources`:

| Source | Records |
|---|---|
| Lee County Property Appraiser (canonical parcels) | **480,844** (reconciling 511,695 source appraiser records) |
| Lee County Permits — Accela (`property_improvements`) | **112,431** |
| Florida Sunbiz registrations | **57,388** |
| BBB contractor reputation profiles | **870** (986 reviews · 716 complaints) |
| Distinct owners | **410k+** |

**Core principle:** every entity and relationship carries its source system, source URL/record key, and collection timestamp; the Q&A layer never makes a claim without a retrieved record behind it.

## Demo video

<!-- REPLACE: drag the recording here or paste the link -->
_Walkthrough of the four views on real records, the inquiry runner, and cited Q&A — recorded against the live runtime above._

## Implementation highlights

- **Ingest** (`packages/ingest`) — resumable IPFS→Postgres pipeline: bulk parquet backbone load, bounded-concurrency fetch of the enriched consolidated records with gateway rotation (`ipfs.io`/`dweb.link`/`w3s.link`/`filebase`), then RAG document + Titan-v2 embedding build. Idempotent by construction via deterministic **UUIDv5** ids keyed on source identifiers.
- **Schema & reconciliation** (`packages/db`) — Drizzle schema ported from `elephant-query-db`; permits map to the Lexicon `property_improvement` class; documented extensions for Reviews/Complaints (BBB), Owners (`person`/`company` + `ownership`), Tenants (Sunbiz occupancy matches), and Contractors (`company` + reputation). Occupancy is _derived_ from Sunbiz registration addresses and labeled as such in the UI.
- **Inquiry engine** (`packages/query/src/inquiries`) — each README inquiry is a typed, deterministic SQL function over the reconciled graph, paginated, returning rows + a total + one `Citation` per row. Permit _timing_ is recovered from `inspections.completed_date` (the export carries no issue/completion dates), so the "last-5-years" and neighbourhood-trend inquiries stay genuinely temporal instead of falling back to volume proxies.
- **Q&A** (`packages/query/src/rag`) — a natural-language router maps questions to canonical inquiries (deterministic SQL + citations); off-script questions use **hybrid retrieval** — pgvector cosine fused with Postgres full-text rank in a single, deterministic SQL — then a Bedrock Claude answer grounded strictly in the retrieved records. Retrieval and generation **degrade gracefully**: under embedding/LLM rate limits the system returns cited retrieval-only results rather than fabricating, and the `mode` badge on each answer states the path used.
- **Provenance** — canonical per-property records resolve on IPFS (the full consolidated JSON: appraisal + permits + `sunbizTenants` + `bbbProfiles` + `collectedAt`); contractor citations link to live bbb.org profiles; permit rows link to the county source system.

## Architecture decisions (and why migration to the kit stack is trivial)

The kit's reference path is tRPC-on-Lambda + Amplify + OpenSearch. I made three deliberate, documented deviations that better fit a read-mostly exploration surface over a single Postgres, and each is a thin, mechanical swap away from the reference:

- **Next.js RSC over tRPC-on-Lambda.** The surface is read-only exploration; server components query Drizzle directly and stream typed results with no client/server contract, no serialization boundary, and no cold starts. All data access is already isolated behind `packages/query` (views/inquiries/rag) — wrapping those functions in tRPC procedures is a thin adapter, not a rewrite.
- **pgvector over OpenSearch.** Embeddings live next to the relational records they cite, so hybrid retrieval is one SQL with deterministic ranking and a single source of truth for provenance — one datastore instead of two to run and reconcile. Because every embedding/answer call already goes through the Vercel AI SDK, moving retrieval to OpenSearch touches one module.
- **App Runner over Amplify Hosting.** A containerized `next build --standalone` image gives an always-on hosted URL with autoscaling and managed HTTPS — protecting the runtime gate and delivery speed. IaC is already CDK (`infra/`: `data-stack` + `web-stack`), so adding Amplify/API-Gateway/Lambda stacks is additive, not a migration.

Net: the storage model (UUIDv5 ids + Drizzle) is engine-agnostic, IaC is already CDK, and LLM access is already SDK-abstracted — the reference stack is reachable by swapping adapters at three seams, with zero change to the domain logic.

## Run it yourself

**Hosted:** the URL above — nothing to install.

**Local:**

```bash
pnpm install
cp .env.example .env        # set DATABASE_URL + AWS_REGION/AWS_PROFILE for Bedrock
pnpm --filter @oracle/ingest ingest  # resumable load of the real Oracle export
pnpm app:dev                          # http://localhost:3000
```

**Deploy:** CDK app in `infra/` — `data-stack` (RDS **Postgres 18.2** + pgvector, Secrets Manager) and `web-stack` (App Runner service from the container image), `us-east-2`, every resource tagged `project_name`.

## Testing & CI

- **GitHub Actions CI** (`.github/workflows/ci.yml`) runs on every push and PR: `pnpm install --frozen-lockfile` then `pnpm run check` on Node 22 / pnpm 10.22.0.
- `pnpm run check` is the single gate: `format:check` (Prettier) → `lint` (ESLint) → `typecheck` (`tsc --noEmit`) → `test` (Vitest) — all green.
- **20 colocated Vitest cases** across the query/shared/ingest packages — filter grammar, deterministic id derivation, RAG document building, and ingest derivation logic — deterministic by construction (no network, no clocks, no variable-count assertions). Live-IPFS/live-DB paths are opt-in behind env flags and excluded from the unit run; the "every required inquiry returns non-empty rows" check runs against the loaded DB as a verification script.

## Demo walkthrough

Each step maps to the README's **Demo Requirements** and **Required Demo Inquiries**, and is a deep link into the live runtime.

**Provenance & scale** — [`/sources`](https://2vpmrwfxgv.us-east-2.awsapprunner.com/sources): per-source counts + the ingestion-run ledger with timestamps.

**Four views on real records:**

- Property — [3150 Matecumbe Key Road](https://2vpmrwfxgv.us-east-2.awsapprunner.com/properties/0d841105-9725-5035-a659-ba5adf024207): ownership history, 37 permits, 17 major improvements, contractor activity, occupancy, and a resolving `ipfs://` source.
- Contractor — [1st Class Roofing](https://2vpmrwfxgv.us-east-2.awsapprunner.com/contractors/820ad78b-4636-50bd-b823-cb4e685e8e9a): BBB rating, quality band, real reviews, complaints, projects, properties-worked, live bbb.org link.
- Business / Tenant — [/businesses](https://2vpmrwfxgv.us-east-2.awsapprunner.com/businesses), [/tenants](https://2vpmrwfxgv.us-east-2.awsapprunner.com/tenants): officers, locations, related properties/permits; derived occupancy history.

**Inquiries** — [`/insights`](https://2vpmrwfxgv.us-east-2.awsapprunner.com/insights). Representative live counts (all 24 required + 3 stretch verified non-empty):

| Inquiry                                | Rows                  | Inquiry                                 | Rows            |
|----------------------------------------|-----------------------|-----------------------------------------|-----------------|
| >1 open permit                         | 263                   | negative-BBB contractors                | 174             |
| open roofing / electrical permits      | 46 / 178              | complaint histories                     | 89              |
| major roof / electrical / concrete     | 7,830 / 7,781 / 2,460 | projects by bad contractors             | 563             |
| highest permit activity (5y)           | 6,506                 | businesses across multiple properties   | 148             |
| significant renovation                 | 3,811                 | owners with multiple properties         | 32,662          |
| roofing / electrical contractors (Lee) | 2,431 / 3,833         | tenants across multiple locations       | 109             |
| ownership change + active permits      | 762                   | neighbourhoods: increasing / renovation | 345 / 3,116     |
| active permits + business turnover     | 71                    | most active contractors / businesses    | 10,045 / 57,190 |

**Relationships (#23)** — the property page connects owners, permits, contractors, and tenant occupancy to one parcel, each with a citation.

**Q&A (#24)** — [`/ask`](https://2vpmrwfxgv.us-east-2.awsapprunner.com/ask): try [poor-BBB contractors](https://2vpmrwfxgv.us-east-2.awsapprunner.com/ask?q=Which%20contractors%20have%20poor%20BBB%20ratings%3F), [businesses across multiple properties](https://2vpmrwfxgv.us-east-2.awsapprunner.com/ask?q=Which%20businesses%20operate%20across%20multiple%20properties%3F) — each returns a cited answer with links to the underlying records.

## Access boundary

The app reads **only its own reconciled RDS Postgres** (Drizzle). Data was ingested exclusively from the **public Oracle open-data IPFS export** — no credentials. No access to the gated Neon `elephant-query-db`, the oracle-node S3 bucket, or the permit-harvest SQS queue.

## Out of scope (per the milestone)

Public-storage publishing, blockchain-style indexing, MCP implementation, and NEO rewiring — the data model stays compatible with future MCP/NEO exposure without changes.
