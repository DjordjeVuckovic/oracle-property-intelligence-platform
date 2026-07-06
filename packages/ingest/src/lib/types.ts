// Minimal type surface required by the vendored normalizers. Ported from
// elephant-query-db/src/loader/types.ts @ b9b8115 (only the pieces the
// normalizers reference).

export type JsonObject = Record<string, unknown>;

// Appraiser/permit source systems are county-parameterized; bbb/sunbiz are fixed.
export type SourceSystem = "bbb" | "sunbiz" | `${string}_appraiser` | `${string}_accela`;

export type SourceMetadata = {
  readonly source_system: string;
  readonly source_record_key: string;
  readonly source_record_hash: string;
  readonly source_artifact_uri: string | null;
};
