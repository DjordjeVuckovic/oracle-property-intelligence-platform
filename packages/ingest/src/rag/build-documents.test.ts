import { describe, expect, it } from "vitest";

import { businessDoc, contractorDoc, neighborhoodDoc, propertyDoc } from "./build-documents.js";

describe("propertyDoc", () => {
  it("formats a rich property document with provenance and dedups nulls", () => {
    const doc = propertyDoc({
      entity_id: "p-1",
      parcel_identifier: "11432001000700010",
      address: "1700 EAST RAILROAD AVENUE",
      city: "BOCA GRANDE",
      zip: "33921",
      property_type: "Building",
      usage_type: "Commercial",
      built_year: 1969,
      owner: "Gasparilla Island Water Assn",
      assessed_value: "258810.00",
      permit_count: 15,
      open_permits: 2,
      improvement_types: ["A/C CHANGE OUT"],
      businesses: ["GASPARILLA ISLAND WATER ASSOCIATION, INC."],
      contractors: ["Ball Construction, Inc. [BBB A+]"],
      source_uri: "ipfs://QmTest",
    });
    expect(doc.entityType).toBe("property");
    expect(doc.entityId).toBe("p-1");
    expect(doc.title).toBe("Property 1700 EAST RAILROAD AVENUE");
    expect(doc.sourceUrl).toBe("ipfs://QmTest");
    expect(doc.body).toContain("Property at 1700 EAST RAILROAD AVENUE, BOCA GRANDE 33921.");
    expect(doc.body).toContain("15 permits (2 open).");
    expect(doc.body).toContain("Contractors: Ball Construction, Inc. [BBB A+].");
  });

  it("states no permits and omits empty sections", () => {
    const doc = propertyDoc({
      entity_id: "p-2",
      parcel_identifier: "999",
      address: "1 MAIN ST",
      permit_count: 0,
      improvement_types: null,
      businesses: null,
      contractors: null,
      source_uri: null,
    });
    expect(doc.body).toContain("No permits.");
    expect(doc.body).not.toContain("Contractors:");
    expect(doc.sourceUrl).toBeNull();
  });
});

describe("contractorDoc", () => {
  it("summarizes BBB reputation with the profile URL as source", () => {
    const doc = contractorDoc({
      entity_id: "c-1",
      name: "Ball Construction, Inc.",
      bbb_rating: "A+",
      is_accredited: true,
      review_count: 3,
      complaint_count: 1,
      score_band: "excellent",
      properties_worked: 12,
      source_uri: "https://bbb.org/x",
    });
    expect(doc.entityType).toBe("contractor");
    expect(doc.title).toBe("Contractor Ball Construction, Inc.");
    expect(doc.sourceUrl).toBe("https://bbb.org/x");
    expect(doc.body).toContain("BBB rating A+.");
    expect(doc.body).toContain("BBB accredited.");
    expect(doc.body).toContain("3 reviews, 1 complaints.");
    expect(doc.body).toContain("Linked to 12 properties via permits.");
  });
});

describe("businessDoc", () => {
  it("describes a Sunbiz registration with officers and locations", () => {
    const doc = businessDoc({
      entity_id: "b-1",
      entity_name: "GASPARILLA ISLAND WATER ASSOCIATION, INC.",
      status: "ACTIVE",
      filing_type: "Domestic Non-Profit",
      filed_date: "1990-01-01",
      officers: ["Caldwell III Robert W"],
      locations: 2,
      source_uri: "ipfs://QmBiz",
    });
    expect(doc.entityType).toBe("business");
    expect(doc.body).toContain("Status: ACTIVE.");
    expect(doc.body).toContain("Officers: Caldwell III Robert W.");
    expect(doc.body).toContain("Registered at 2 property address(es)");
  });
});

describe("neighborhoodDoc", () => {
  it("derives a stable id from the subdivision name", () => {
    const a = neighborhoodDoc({ subdivision: "BOCA GRANDE BLK 70", property_count: 42 });
    const b = neighborhoodDoc({ subdivision: "BOCA GRANDE BLK 70", property_count: 42 });
    expect(a.entityId).toBe(b.entityId);
    expect(a.entityType).toBe("neighborhood");
    expect(a.body).toContain("42 properties.");
  });
});
