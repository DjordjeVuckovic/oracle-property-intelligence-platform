import { normalizeName, readString } from "./normalizers.js";

// ---------------------------------------------------------------------------
// Derived-intelligence helpers used by the loader. Kept pure and unit-tested so
// classification is deterministic and reviewable — no hidden magic in SQL.
// ---------------------------------------------------------------------------

// Open vs closed permit status, derived from the consolidated record's free-text
// `recordStatus` (e.g. "Closed-Conversion", "Issued", "Finaled", "Void"). The
// base schema exposes `improvement_status` on permit_search_view; we populate it.
const CLOSED_TOKENS = ["closed", "final", "complete", "expired", "void", "cancel", "withdrawn"];
const OPEN_TOKENS = ["open", "issued", "active", "in review", "in progress", "pending", "applied"];

export function classifyPermitStatus(recordStatus: string | null): "open" | "closed" | null {
  const text = readString(recordStatus)?.toLowerCase();
  if (!text) return null;
  if (CLOSED_TOKENS.some((t) => text.includes(t))) return "closed";
  if (OPEN_TOKENS.some((t) => text.includes(t))) return "open";
  return null;
}

// Major-renovation categories. The classifier scans BOTH improvementType and
// projectDescription because, in real records, improvementType is often noise
// ("of System: Condenser Only...") while the real signal is in the description
// ("A/C CHANGE OUT"). Keyword tables live here (tested), not buried in SQL.
export const RENOVATION_CATEGORIES = {
  roofing: ["roof", "reroof", "re-roof", "shingle", "roofing"],
  electrical: ["electric", "electrical", "wiring", "panel", "service upgrade", "solar"],
  concrete: ["concrete", "foundation", "slab", "footing", "seawall"],
  structural: ["structural", "structure", "addition", "framing", "load bearing", "demolition", "demo"],
  plumbing: ["plumb", "plumbing", "sewer", "water heater", "repipe", "re-pipe"],
  hvac: ["hvac", "a/c", "ac ", "air condition", "condenser", "heat pump", "mechanical", "furnace"],
} as const;

export type RenovationCategory = keyof typeof RENOVATION_CATEGORIES;

export function classifyRenovation(
  improvementType: string | null,
  projectDescription: string | null
): RenovationCategory[] {
  const haystack = `${improvementType ?? ""} ${projectDescription ?? ""}`.toLowerCase();
  if (haystack.trim().length === 0) return [];
  const matched: RenovationCategory[] = [];
  for (const [category, keywords] of Object.entries(RENOVATION_CATEGORIES)) {
    if (keywords.some((kw) => haystack.includes(kw))) matched.push(category as RenovationCategory);
  }
  return matched;
}

// Legal-entity suffixes and role words that mark the company portion of a messy
// permit-contact blob ("ROBERT S MILLER GRANDE AIRE SERVICES INC ...").
const COMPANY_MARKERS = [
  "inc",
  "llc",
  "corp",
  "co",
  "company",
  "services",
  "service",
  "construction",
  "contractors",
  "contractor",
  "builders",
  "building",
  "roofing",
  "electric",
  "electrical",
  "plumbing",
  "mechanical",
  "air",
  "aire",
  "hvac",
  "enterprises",
  "group",
  "systems",
  "pools",
  "homes",
];

// Best-effort contractor company name from a contact's raw blob. Returns the
// window of tokens around the first company marker up to a legal suffix. Honest
// about its limits: null when no marker is present rather than guessing.
export function extractContractorCompany(rawName: string | null): string | null {
  const text = readString(rawName);
  if (!text) return null;
  const tokens = text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const markerIdx = tokens.findIndex((t) => COMPANY_MARKERS.includes(t.toLowerCase()));
  if (markerIdx === -1) return null;
  // Walk left to the token after the last "person-like" break, and right to the
  // first legal suffix (inc/llc/corp), inclusive.
  const suffixes = new Set(["INC", "LLC", "CORP", "CO", "PA", "LLP"]);
  let end = markerIdx;
  for (let i = markerIdx; i < tokens.length && i < markerIdx + 5; i++) {
    if (suffixes.has(tokens[i]!)) {
      end = i;
      break;
    }
    end = i;
  }
  const start = Math.max(0, markerIdx - 3);
  const candidate = tokens.slice(start, end + 1).join(" ");
  return normalizeName(candidate);
}
