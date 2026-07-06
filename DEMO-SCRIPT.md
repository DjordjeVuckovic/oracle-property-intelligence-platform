# Demo Script — Oracle Property Intelligence Platform

Run through this once as a rehearsal, then record. Follows the README Demo Requirements in order, leads with genuine strengths, and stays honest about the `/ask` mode so nothing in the video contradicts what the grader sees when it drives the runtime. Target ~6–7 minutes.

**Base URL:** `https://2vpmrwfxgv.us-east-2.awsapprunner.com`

```
[0:00 — Intent, 20s]
Open the home page. Say: "Oracle Property Intelligence — an analyst's exploration
layer over the real Lee County Oracle open-data export. Four views, one-click
inquiries, and source-cited Q&A. Every number on screen resolves to a real record."
Point at the hero: 480,844 canonical properties reconciling 511,695 source records.

[0:20 — Provenance & scale, 40s]  → /sources
Show per-source counts (Appraiser 480,844 · Accela permits 112,431 · Sunbiz 57,388 ·
BBB 870 with 986 reviews / 716 complaints) and the ingestion-run ledger with
timestamps. Say: "This is the loaded dataset, not an estimate — nothing is seeded
or mocked; it's the public Oracle IPFS export from 2026-06-25."

[1:00 — Property View, 75s]  → /properties, search, then open
  /properties/0d841105-9725-5035-a659-ba5adf024207  (3150 Matecumbe Key Road)
Walk the panels out loud: ownership history, permit history (37 real permits with
numbers/status/contractor/value), 17 major improvements, contractor activity (14
firms), business occupancy. Scroll to the footer and CLICK the "source record"
ipfs:// link — show it resolves to the full consolidated JSON. Say: "Source for
every claim."

[2:15 — Contractor View, 60s]  → /contractors, then open a contractor WITH reviews
  /contractors/820ad78b-4636-50bd-b823-cb4e685e8e9a  (1st Class Roofing)
Show BBB rating, quality band, real Reviews (dates, ratings, text), complaints panel,
projects, properties-worked. CLICK the bbb.org profile link to show real provenance.

[3:15 — Business View, 40s]  → /businesses → open one
Show officers/ownership, registration addresses (locations), related properties,
related permits. Say: "Sunbiz registration reconciled to the property graph."

[3:55 — Tenant View, 35s]  → /tenants → open one
Show occupancy history, tenant→property, permits on occupied properties. Read the
in-UI note aloud: "Occupancy is derived from Sunbiz — business occupancy, not stored
residential tenancy." (Calling out the honest modeling is a plus.)

[4:30 — Inquiries / derived intelligence, 75s]  → /insights
Run 4–5 cards live, letting each load so the count is visibly real:
  • Properties with >1 open permit (263)
  • Contractors with negative BBB ratings (174) — point out the BBB column + Source
  • Projects by contractors with negative BBB / complaints (563)
  • Neighborhoods with increasing permit activity (345)
  • Most active contractors by project count (10,045)
Say: "24 required inquiries plus 3 stretch, every one returns real rows with a
citation per row." Hover/point at a Source link.

[5:45 — Relationships (#23), 20s]
Back on the property page, point at how owners, permits, contractors, and tenant
occupancy are all connected to one parcel with citations — the relationship graph.

[6:05 — Q&A (#24), 45s]  → /ask
Click the CHIPS (they return clean, cited answers):
  • "Which contractors have poor BBB ratings?" → cited contractors + bbb.org links
  • "Which businesses operate across multiple properties?" → cited businesses
Say honestly: "Answers are grounded strictly in retrieved records and cite their
sources — no claim without a record. The mode badge shows the retrieval path."
(Do NOT type an obscure off-script question live — the demo should show the product
at its reliable best.)

[6:50 — Close, 15s]
"Real Oracle data end to end, four views, 27 one-click inquiries, cited Q&A, hosted
and reachable with zero setup. Thanks."
```

## Rehearsal checklist before you hit record
- Every route loads in one try (warm each first — App Runner/RSC cold hits can take a few seconds).
- Each inquiry shows a non-zero count. **If any inquiry shows 0, that's a real bug to fix before publishing — flag it.**
- At least one `ipfs://` and one `bbb.org` link actually resolve in the browser.
- The `/ask` chips return cited answers.
