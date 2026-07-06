// Display formatters for the data surfaces. Null-safe; return "—" for missing.
const DASH = "—";

export function money(value: unknown): string {
  if (value === null || value === undefined || value === "") return DASH;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DASH;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function num(value: unknown): string {
  if (value === null || value === undefined || value === "") return DASH;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : DASH;
}

export function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? DASH : String(value);
}

export function date(value: unknown): string {
  const s = text(value);
  return s === DASH ? DASH : s.slice(0, 10);
}

// Turn an ipfs://<cid> artifact into a browsable gateway link; pass through http(s).
export function sourceHref(value: unknown): string | null {
  const s = typeof value === "string" ? value : null;
  if (!s) return null;
  if (s.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${s.slice("ipfs://".length)}`;
  return s.startsWith("http") ? s : null;
}
