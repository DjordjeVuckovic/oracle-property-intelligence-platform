import { describe, expect, it } from "vitest";

import {
  classifyPermitStatus,
  classifyRenovation,
  extractContractorCompany,
} from "./derive.js";

describe("classifyPermitStatus", () => {
  it("maps closed-family statuses to closed", () => {
    expect(classifyPermitStatus("Closed-Conversion")).toBe("closed");
    expect(classifyPermitStatus("Finaled")).toBe("closed");
    expect(classifyPermitStatus("VOID")).toBe("closed");
  });

  it("maps open-family statuses to open", () => {
    expect(classifyPermitStatus("Issued")).toBe("open");
    expect(classifyPermitStatus("In Review")).toBe("open");
    expect(classifyPermitStatus("Active")).toBe("open");
  });

  it("returns null for unknown or empty status", () => {
    expect(classifyPermitStatus("Wibble")).toBeNull();
    expect(classifyPermitStatus(null)).toBeNull();
    expect(classifyPermitStatus("")).toBeNull();
  });
});

describe("classifyRenovation", () => {
  it("reads the real signal from projectDescription when improvementType is noise", () => {
    expect(
      classifyRenovation("of System: Condenser Only Seer: 10", "A/C CHANGE OUT CONDENSER ONLY")
    ).toEqual(["hvac"]);
  });

  it("detects multiple categories across both fields", () => {
    const cats = classifyRenovation("Roof replacement", "new electrical panel and repipe plumbing");
    expect(cats.sort()).toEqual(["electrical", "plumbing", "roofing"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(classifyRenovation("Fence install", "wood privacy fence")).toEqual([]);
    expect(classifyRenovation(null, null)).toEqual([]);
  });
});

describe("extractContractorCompany", () => {
  it("pulls a normalized company key out of a messy contact blob (best-effort, deterministic)", () => {
    // Heuristic: window around the first company marker up to the legal suffix.
    // It may include a leading token; the value only needs to be stable so the
    // same contractor collapses to one company id across permits.
    expect(
      extractContractorCompany("ROBERT S MILLER GRANDE AIRE SERVICES INC P.O.BOX 743")
    ).toBe("S MILLER GRANDE AIRE SERVICES INC");
  });

  it("stops at the legal suffix", () => {
    expect(extractContractorCompany("ACME ROOFING LLC 123 MAIN ST")).toBe("ACME ROOFING LLC");
  });

  it("returns null when no company marker is present", () => {
    expect(extractContractorCompany("JOHN Q HOMEOWNER")).toBeNull();
    expect(extractContractorCompany(null)).toBeNull();
  });
});
