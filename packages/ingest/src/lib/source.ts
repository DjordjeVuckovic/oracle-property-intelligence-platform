import { hashJson, readDate } from "./normalizers.js";

// Source-metadata + coercion helpers shared by the record mapper. Every row
// carries provenance (source_system, source_record_key, hash, artifact URI) so
// the platform can cite where each fact came from.

export type SourceMeta = {
  sourceSystem: string;
  sourceRecordKey: string;
  sourceRecordHash: string;
  sourceArtifactUri: string | null;
};

export function sourceMeta(
  sourceSystem: string,
  sourceRecordKey: string,
  payload: unknown,
  artifactUri: string | null
): SourceMeta {
  return {
    sourceSystem,
    sourceRecordKey,
    sourceRecordHash: hashJson(payload),
    sourceArtifactUri: artifactUri,
  };
}

// The consolidated record's own provenance pointer.
export function ipfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

// Numeric columns are Drizzle `numeric` → string in JS. Consolidated values
// arrive already as strings ("258810.00") or null; pass through unchanged.
export function numStr(value: string | null): string | null {
  return value;
}

// Coerce a record date-ish string to a Postgres-safe YYYY-MM-DD (or null).
export function dateStr(value: string | null): string | null {
  return readDate(value);
}
