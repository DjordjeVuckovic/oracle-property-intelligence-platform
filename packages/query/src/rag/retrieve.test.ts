import { describe, expect, it } from "vitest";

import { toOrTsQuery } from "./retrieve.js";

// toOrTsQuery builds the lexeme string for the FTS-only fallback that keeps /ask
// answering (with citations) when Bedrock embedding is throttled. OR semantics
// (recall-oriented) and stopword/short-token dropping are the behavior that
// matters, so pin them here.

describe("toOrTsQuery", () => {
  it("keeps 3+ char alphanumeric terms and OR-joins them", () => {
    expect(toOrTsQuery("Show properties with roofing permits")).toBe(
      "show | properties | with | roofing | permits"
    );
  });

  it("lowercases and strips punctuation", () => {
    expect(toOrTsQuery("Poor BBB, ratings!")).toBe("poor | bbb | ratings");
  });

  it("drops tokens shorter than 3 chars (including stray digits)", () => {
    expect(toOrTsQuery("2 story homes on a lot")).toBe("story | homes | lot");
  });

  it("deduplicates repeated terms, preserving first-seen order", () => {
    expect(toOrTsQuery("roof roofing roof")).toBe("roof | roofing");
  });

  it("returns an empty string when nothing qualifies (caller then returns no rows)", () => {
    expect(toOrTsQuery("a to be of")).toBe("");
    expect(toOrTsQuery("!!! ?? 1 2")).toBe("");
  });
});
