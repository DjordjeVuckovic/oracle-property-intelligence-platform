// Provenance travels with every row and citation: which source system a fact
// came from, its source URL/artifact, and when it was collected. Surfaced in the
// UI (footers, citation cards) so no claim is unsourced.
export type Provenance = {
  sourceSystem: string | null;
  sourceUrl: string | null;
  sourceRecordKey: string | null;
};

export type Citation = {
  entityType: string;
  entityId: string;
  label: string;
  sourceUrl: string | null;
  score?: number;
};
