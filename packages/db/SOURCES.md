# Schema provenance

The base Drizzle schema in `src/schema/` is ported from
[`elephant-xyz/elephant-query-db`](https://github.com/elephant-xyz/elephant-query-db)
at commit `b9b8115`, files `src/schema/*.ts`.

| File | Upstream origin | Notes |
|---|---|---|
| `shared.ts` | `src/schema/shared.ts` | verbatim — source-metadata + timestamp column helpers |
| `core.ts` | `src/schema/core.ts` | verbatim — addresses, people, companies |
| `appraisal.ts` | `src/schema/appraisal.ts` | verbatim — parcels, properties, taxes, sales, structures, etc. |
| `permits.ts` | `src/schema/permits.ts` | verbatim — property_improvements (= permits) + child tables |
| `sunbiz.ts` | `src/schema/sunbiz.ts` | verbatim — business_registrations + parties/addresses/reports |
| `bbb.ts` | `src/schema/bbb.ts` | verbatim — business_reputation_profiles + reviews/complaints/scores |
| `views.ts` | `src/schema/views.ts` | verbatim — property/permit/company/address profile views |
| `extensions.ts` | **new** | platform additions (see below) |

This schema **is** the Elephant Lexicon applied to the Oracle Lee County export:
the consolidated per-property IPFS record produced by
`scripts/run-property-consolidation-export.ts` maps 1:1 back onto these tables,
and the loader in `packages/ingest` inverts that export field-by-field.

## Extensions (`extensions.ts`)

Documented additions the base schema does not model (rationale in
`docs/LEXICON.md`):

- `occupancies` — derived tenant layer (Sunbiz business ↔ property address).
- `entity_documents` — denormalized RAG retrieval docs with a pgvector embedding.
- `ingestion_runs` — per-stage ingestion audit ledger surfaced on `/sources`.
- `inquiry_registry` — canonical one-click inquiry catalog for the NL router.

Do not hand-edit the ported files; re-port from upstream and re-apply the commit
pointer if they change.
