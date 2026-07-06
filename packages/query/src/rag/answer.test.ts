import { describe, expect, it } from "vitest";

import { getInquiry } from "../inquiries/index.js";
import { routeCanonicalQuestion } from "./answer.js";

// The deterministic NL router is the critical path that keeps /ask answerable
// while Bedrock is throttled: routed questions are served by typed SQL + real
// citations with no model call. These tests pin the routing table so a rule
// reorder or key typo that would silently drop a demo question to the (fragile)
// semantic path is caught here.

// [question, expected canonical inquiry key]. Covers the full README demo set.
const CASES: ReadonlyArray<readonly [string, string]> = [
  // the three /ask demo chips
  ["Which contractors have poor BBB ratings?", "contractors-negative-bbb"],
  ["Show properties with roofing permits", "properties-major-roof-replacement"],
  ["Which businesses operate across multiple properties?", "businesses-multiple-properties"],
  // permits
  ["properties with more than one open permit", "properties-multiple-open-permits"],
  ["show open roofing permits", "properties-open-roofing-permit"],
  ["properties with open electrical permits", "properties-open-electrical-permit"],
  ["properties with the highest permit activity", "properties-highest-permit-activity"],
  // renovations
  ["properties that underwent major concrete work", "properties-major-concrete-work"],
  ["major electrical upgrades", "properties-major-electrical-upgrade"],
  ["properties with significant renovation activity", "properties-significant-renovation"],
  ["value add investment properties", "stretch-value-add-investment"],
  // contractors
  ["contractors performing roofing work in lee county", "contractors-roofing-lee-county"],
  ["contractors doing electrical work", "contractors-electrical-lee-county"],
  ["contractors with complaint histories", "contractors-complaint-history"],
  ["most active contractors by project count", "contractors-most-active"],
  // cross-signal
  ["projects by contractors with negative bbb", "projects-negative-contractors"],
  [
    "properties with ownership changes and active permits",
    "properties-ownership-change-active-permits",
  ],
  [
    "properties with active permits and business turnover",
    "properties-active-permits-business-turnover",
  ],
  ["properties likely undergoing redevelopment", "stretch-redevelopment-candidates"],
  // neighborhoods
  ["neighborhoods with increasing permit activity", "neighborhoods-increasing-permits"],
  ["neighborhoods with the most major renovations", "neighborhoods-major-renovation-concentration"],
  // owners / tenants / businesses
  ["owners associated with multiple properties", "owners-multiple-properties"],
  ["tenants operating across multiple locations", "tenants-multiple-locations"],
  ["most active businesses by footprint", "businesses-most-active-footprint"],
];

describe("routeCanonicalQuestion", () => {
  it("routes each canonical demo question to its inquiry", () => {
    for (const [question, expectedKey] of CASES) {
      expect(routeCanonicalQuestion(question)?.inquiryKey).toBe(expectedKey);
    }
  });

  it("never routes to an unregistered inquiry (no dangling routes)", () => {
    for (const [question] of CASES) {
      const route = routeCanonicalQuestion(question);
      expect(route).not.toBeNull();
      if (route) expect(getInquiry(route.inquiryKey)).toBeDefined();
    }
  });

  it("is case- and punctuation-insensitive", () => {
    expect(routeCanonicalQuestion("WHICH CONTRACTORS HAVE POOR BBB RATINGS???")?.inquiryKey).toBe(
      "contractors-negative-bbb"
    );
  });

  it("prefers the more specific rule when scopes overlap", () => {
    // project + contractor + negative must beat the plain negative-BBB rule
    expect(
      routeCanonicalQuestion("projects completed by contractors with negative bbb")?.inquiryKey
    ).toBe("projects-negative-contractors");
    // contractor-scoped roofing must beat property roofing
    expect(routeCanonicalQuestion("contractors performing roofing")?.inquiryKey).toBe(
      "contractors-roofing-lee-county"
    );
    // multiple open permits must beat single open-roofing
    expect(routeCanonicalQuestion("properties with multiple open permits")?.inquiryKey).toBe(
      "properties-multiple-open-permits"
    );
  });

  it("returns null for questions with no canonical match (semantic fallback)", () => {
    expect(routeCanonicalQuestion("tell me about the weather today")).toBeNull();
    expect(routeCanonicalQuestion("hello there")).toBeNull();
  });
});
