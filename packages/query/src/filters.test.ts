import { describe, expect, test } from "vitest";

import { parseFilters } from "./filters.js";

describe("parseFilters", () => {
  test("ignores blank submitted fields", () => {
    const filters = parseFilters({
      q: "  ",
      county: "",
      municipality: "  ",
      contractor: "",
      page: "2",
      pageSize: "50",
    });

    expect(filters.q).toBeUndefined();
    expect(filters.county).toBeUndefined();
    expect(filters.municipality).toBeUndefined();
    expect(filters.contractor).toBeUndefined();
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(50);
  });

  test("accepts next-style array query params", () => {
    const filters = parseFilters({
      municipality: ["Cape Coral", "Lehigh Acres"],
      page: ["3"],
    });

    expect(filters.municipality).toBe("Cape Coral");
    expect(filters.page).toBe(3);
  });
});
