# Design System — Oracle Property Intelligence Platform

Derived from the live [elephant.xyz](https://www.elephant.xyz/) brand (tokens extracted from production CSS on 2026-07-06) and adapted for a data-dense intelligence product. Components follow shadcn/ui conventions (cva variants, `cn()` merge, `components/ui/*`).

**Aesthetic direction: "field ledger."** Warm paper, warm ink, hairline rules, tabular numerals — the calm of a county record book — punctuated by Elephant's electric mint and split-flap counters that celebrate the scale of verified data. Dark warm panels frame the experience (nav, hero, footer); everything between stays light, airy, and ruthlessly legible. This is a reading instrument, not a marketing page: color signals meaning (mint = verified/positive, red = risk), never decoration.

## 1. Tokens (extracted from elephant.xyz)

| Token | Hex | HSL (shadcn var) | Source / role |
|---|---|---|---|
| `paper` (background) | `#fffdfa` | `40 100% 99%` | site `--paper`; page background |
| `ink` (foreground) | `#423e3e` | `0 3% 25%` | site `--dark`/`--text`; all body text |
| `ink-panel` | `#262222` | `0 6% 14%` | hero/footer/nav dark panels (site overlay `#232020`) |
| `mint` (primary) | `#2be786` | `149 80% 54%` | site `--green`; CTAs, verified accents, flap digits |
| `mint-tint` (accent) | `#ccf7d7` | `135 73% 88%` | site `--mint`; badges, highlighted rows |
| `mist` (secondary/muted) | `#f5f5f5` | `0 0% 96%` | site `--mist`; alternating sections, table stripes |
| `line` (border/input) | `#d8d4d0` | `30 9% 83%` | site `--line`; hairlines everywhere |
| `muted-fg` | `#6a6666` | `0 2% 41%` | site `--muted`; meta text, captions |
| `card` | `#ffffff` | `0 0% 100%` | cards on paper/mist |
| `risk` (destructive) | `#d64545` | `0 64% 55%` | not on site; warm red for complaints/negative BBB |
| `ring` | `#2be786` | `149 80% 54%` | focus rings |

shadcn semantic mapping (`globals.css`): `--background`=paper, `--foreground`=ink, `--primary`=mint with `--primary-foreground: 150 23% 10%` (near-black ink — mint fails contrast with white text), `--secondary`/`--muted`=mist, `--accent`=mint-tint, `--border`/`--input`=line, `--destructive`=risk, `--radius: 0.75rem`.

**Color rules**
- Mint is never body-text-on-white (contrast fail). Use it as: fill with dark text, large display digits on dark panels, eyebrow labels ≥ 12px bold uppercase, heading highlights (`<span class="text-primary">`).
- Warm neutrals only — no cool grays anywhere.
- Dark panels use `white`, `white/78` (body), `white/60` (meta) — measured from the site.
- Risk red reserved for negative reputation signals (complaints, F ratings); mint reserved for verified/positive.

## 2. Typography

The brand font "Neue Elephant" (400/600/800) is proprietary. Substitute:

| Role | Font | Usage |
|---|---|---|
| Sans (UI + headings) | **Archivo** (variable, Google) — `--font-sans` | body 400, emphasis 600, headings **800** with `tracking-[-0.01em]` and tight leading (~1.04 on display sizes) — mirrors Neue Elephant's heavy grotesque voice |
| Display (numbers) | **Bebas Neue** (Google) — `--font-display` | split-flap digits, stat tiles, eyebrow labels — the site literally maps Bebas as its display/mono slot |

Scale (desktop → data-app calibrated): display `clamp(2.5rem,5vw,3.5rem)/800`; h1 `2rem/800`; h2 `1.5rem/800`; h3 `1.125rem/700`; body `1rem/400`; meta `0.8125rem/500 text-muted-foreground`; eyebrow `0.75rem Bebas uppercase tracking-[0.18em] text-primary` (on dark) / `text-[#1b9a5c]` (on paper, darkened mint for contrast). **All numeric table cells and stats: `tabular-nums`.**

## 3. Signature elements (what makes it Elephant)

1. **Split-flap counter** (`StatFlap`) — the site's hero device: per-digit white rounded cards, mint Bebas digits, horizontal midline rule. We use it for headline scale numbers (511,695 properties; 175,594 permits). One per page maximum.
2. **Pill button with arrow** — fully rounded (`rounded-full`), mint fill, dark ink label, `→` suffix that nudges right on hover.
3. **Mint-tint badge** — `rounded-full bg-accent text-foreground` ("Open permit", "Verified", "Accredited").
4. **Dark inset footer panel** — dark rounded-2xl card inset from the page edges (site's footer), carrying the dataset tagline.
5. **Eyebrow → heavy heading → quiet meta** stack on every page header, green eyebrow first.
6. **Provenance footer** on every entity card/page: source system · linked source URL · collected/refreshed timestamps. Provenance is a first-class visual citizen — it's the product's proof.

## 4. Components

`components/ui/*` (shadcn-style generics, cva + cn, no Radix dependency in stubs):

| Component | Variants / notes |
|---|---|
| `Button` | `default` (mint pill + optional arrow), `outline` (hairline pill), `ghost`, `ink` (dark panel CTA); sizes `sm/default/lg`. Always `rounded-full font-semibold` |
| `Badge` | `default` (mint-tint), `outline`, `ink`, `risk` (red-tint), `score` (Bebas digits) — all pills |
| `Card` | white, `border-border rounded-xl`, shadow none→`shadow-sm` on hover for links; Header/Title/Description/Content/Footer parts |
| `Table` | hairline `border-b border-border` rows, `bg-muted/50` header, `tabular-nums` cells, hover `bg-accent/30` |
| `Input` | `rounded-lg border-input bg-card`, mint focus ring |
| `Skeleton` | `bg-muted` shimmer |
| `Separator` | 1px `bg-border` |

`components/app/*` (product components):

| Component | Purpose |
|---|---|
| `SiteNav` | dark ink bar: logo mark + wordmark, view links, `/insights` pill CTA |
| `SiteFooter` | dark inset panel: tagline, dataset counts, source links |
| `PageHeader` | eyebrow + h1 + description + actions slot |
| `SectionHeader` | centered eyebrow + h2 for landing sections |
| `StatFlap` | split-flap number (string → digit cards) |
| `StatTile` | label + Bebas number + hint (dashboard rows) |
| `LinkTabs` | underline tabs as links (server-friendly section nav on detail pages) |
| `FilterBar` | horizontal filter row (municipality, permit type, class, date range) |
| `CitationCard` | RAG citation: title, entity link, source URL, similarity score badge |
| `ProvenanceFooter` | source system · source URL · collected/refreshed timestamps |
| `EmptyState` | dashed hairline box, message + hint (also the stub placeholder) |

## 5. Layout & motion

- Max width `1200px`, gutter `px-6`; generous vertical rhythm (`py-16` landing sections, `py-8` app pages).
- App pages: full-bleed light; landing/home alternates paper → mist → dark panel (site rhythm).
- Lists left-aligned and dense; landing sections center-aligned (site convention).
- Motion is restrained and purposeful: one staggered reveal on page load (80ms steps), flap digits animate once on mount (200ms flip), arrow nudge on button hover, row hover tint. No scroll-jacking, no parallax. `prefers-reduced-motion` disables all of it.
- Focus states always visible (mint ring); tables keyboard-navigable; every interactive element ≥ 40px hit target.

## 6. Page inventory (stubs scaffolded, implementation later)

| Route | Purpose |
|---|---|
| `/` | hero (dark panel + StatFlap 511,695) + four view cards + how-it-works strip |
| `/properties`, `/properties/[id]` | explorer + detail (ownership, permits, occupancy, improvements, relationships) |
| `/tenants`, `/tenants/[id]` | derived-occupancy explorer + detail |
| `/businesses`, `/businesses/[id]` | Sunbiz explorer + detail |
| `/contractors`, `/contractors/[id]` | contractor explorer + detail (BBB, complaints, quality) |
| `/insights` | the 24 required inquiries, one-click each |
| `/ask` | NL Q&A with citations + evidence panel |
| `/sources` | dataset provenance: channels, CIDs, counts, refresh timestamps |

## 7. Don'ts

- No purple, no blue gradients, no cool grays, no Inter.
- No mint body text on light backgrounds; no white text on mint.
- No borderless floating cards (everything sits on a hairline), no heavy drop shadows.
- No decorative icons narrating data — numbers and provenance are the decoration.
- No dark mode in v1 (the brand is paper-first; dark is reserved for panels).
