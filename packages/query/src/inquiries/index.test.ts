import { describe, expect, it } from "vitest";

import { INQUIRIES } from "./index.js";

// Registry-integrity tests for the inquiry engine. These are deterministic and
// hit no database — they guard the shape of the canonical inquiry set (the 24
// required demo inquiries plus stretch), catching an accidentally dropped,
// duplicated, or malformed entry without needing the loaded DB.
describe("INQUIRIES registry", () => {
  it("registers at least the 24 required inquiries", () => {
    expect(INQUIRIES.length).toBeGreaterThanOrEqual(24);
  });

  it("has unique, kebab-case keys", () => {
    const keys = INQUIRIES.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]+$/);
  });

  it("gives every inquiry a label, description, and a runnable function", () => {
    for (const i of INQUIRIES) {
      expect(i.label.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
      expect(typeof i.run).toBe("function");
    }
  });

  it("includes the entity drill-down inquiries whose rows must resolve to a view", () => {
    const keys = new Set(INQUIRIES.map((i) => i.key));
    for (const required of [
      "properties-open-roofing-permit",
      "contractors-negative-bbb",
      "businesses-multiple-properties",
      "owners-multiple-properties",
      "tenants-multiple-locations",
    ]) {
      expect(keys.has(required)).toBe(true);
    }
  });
});
