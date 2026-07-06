import { consolidatedPropertySchema, idFor } from "@oracle/shared";
import { describe, expect, it } from "vitest";

import { classifyPermitStatus, extractContractorCompany } from "../lib/derive.js";
import { normalizeParcelIdentifier } from "../lib/normalizers.js";
import { emptyRowSets, mapRecord } from "./map-record.js";

// mapRecord is the core reconciliation step: one consolidated IPFS record ->
// the normalized row sets of the ported schema. It is pure and deterministic,
// so it is unit-tested against a fixture that exercises every source system
// (appraiser, permits, Sunbiz, BBB) and the derived occupancy edge.

const RAW = {
  county: "lee",
  collectedAt: "2026-06-25T00:00:00Z",
  sourceSystem: "lee_appraiser",
  jurisdictionKey: "lee_appraiser",
  address: { street: "123 MAIN ST", city: "FORT MYERS", state: "FL", postalCode: "33901" },
  property: {
    propertyType: "Building",
    usageType: "Residential",
    builtYear: 1998,
    subdivision: "PALM ISLES",
  },
  parcel: { parcelIdentifier: "01-4321-00-0040.0000", countyName: "Lee", stateCode: "FL" },
  ownerships: [{ ownedBy: "JOHN Q DOE", ownershipPercentage: "100", ownerOccupied: true }],
  taxes: [{ taxYear: 2025, assessedValue: "250000.00", marketValue: "300000.00" }],
  sales: [{ date: "2019-05-01", price: "275000", instrumentNumber: "2019-1" }],
  permits: [
    {
      permitNumber: "ROF2020-00123",
      improvementType: "RE-ROOF",
      recordStatus: "Issued",
      projectDescription: "Full reroof, shingle",
      contacts: [{ contactRole: "CONTRACTOR", rawName: "ABC ROOFING INC" }],
      inspections: [{ inspectionNumber: "1", completedDate: "2021-03-10", result: "PASS" }],
      links: [{ linkKind: "portal", url: "https://www.leegov.com/permit/ROF2020-00123" }],
    },
  ],
  sunbizTenants: [
    {
      documentNumber: "P05000046560",
      entityName: "ACME WIDGETS LLC",
      status: "ACTIVE",
      filingType: "Florida Limited Liability",
      parties: [{ partyRole: "OFFICER", name: "JANE ROE", title: "MGR" }],
      addresses: [
        {
          addressRole: "PRINCIPAL",
          line1: "500 1ST ST",
          city: "FORT MYERS",
          state: "FL",
          zip: "33901",
        },
      ],
    },
  ],
  bbbProfiles: [
    {
      name: "ABC Roofing Inc",
      profileUrl: "https://www.bbb.org/us/fl/fort-myers/profile/roofing/abc-0653-1",
      bbbRating: "F",
      isAccredited: false,
      reviewCount: 2,
      complaintCount: 1,
      scoreBand: "poor",
      reviews: [{ reviewDate: "2025-01-02", reviewRating: "1", reviewText: "poor work" }],
      complaints: [
        { complaintDate: "2024-12-01", complaintType: "Service", complaintSummary: "late" },
      ],
    },
  ],
};

const CID = "QmTestCid00000000000000000000000000000000000";

// The fixture parcel identifier normalizes to a non-null digit key; narrow it
// once so id assertions type-check without a non-null assertion.
function requirePid(value: string): string {
  const pid = normalizeParcelIdentifier(value);
  if (pid === null) throw new Error(`fixture parcel id did not normalize: ${value}`);
  return pid;
}
const PID = requirePid(RAW.parcel.parcelIdentifier);

function mapped() {
  const record = consolidatedPropertySchema.parse(RAW);
  const out = emptyRowSets();
  mapRecord(record, CID, out);
  return out;
}

describe("mapRecord", () => {
  it("normalizes the parcel identifier to digits and derives deterministic ids", () => {
    const out = mapped();
    expect(out.parcels).toHaveLength(1);
    expect(out.parcels[0]?.parcelIdentifier).toBe(PID);
    expect(out.parcels[0]?.parcelId).toBe(idFor.parcel(PID));
    expect(out.properties[0]?.propertyId).toBe(idFor.property(PID));
    expect(out.properties[0]?.parcelId).toBe(idFor.parcel(PID));
  });

  it("maps appraiser sub-records (address, ownership, tax, sale)", () => {
    const out = mapped();
    expect(out.addresses).toHaveLength(1);
    expect(out.addresses[0]?.unnormalizedAddress).toBe("123 MAIN ST");
    expect(out.ownerships).toHaveLength(1);
    expect(out.ownerships[0]?.ownedBy).toBe("JOHN Q DOE");
    expect(out.taxes[0]?.taxYear).toBe(2025);
    expect(out.salesHistories).toHaveLength(1);
  });

  it("maps a permit to a property_improvement with classified status, contractor, and children", () => {
    const out = mapped();
    expect(out.propertyImprovements).toHaveLength(1);
    const pi = out.propertyImprovements[0];
    expect(pi?.permitNumber).toBe("ROF2020-00123");
    // status comes from the classifier, source URL from the first permit link
    expect(pi?.improvementStatus).toBe(classifyPermitStatus("Issued"));
    expect(pi?.sourceUrl).toBe("https://www.leegov.com/permit/ROF2020-00123");
    // contractor company extracted from the contact and linked to the permit + companies
    const company = extractContractorCompany("ABC ROOFING INC");
    expect(company).not.toBeNull();
    const expectedCompanyId = company === null ? null : idFor.company(company);
    expect(pi?.contractorCompanyId).toBe(expectedCompanyId);
    expect(out.companies.some((c) => c.companyId === pi?.contractorCompanyId)).toBe(true);
    expect(out.permitContacts).toHaveLength(1);
    expect(out.inspections).toHaveLength(1);
    expect(out.permitLinks).toHaveLength(1);
  });

  it("maps a sunbiz tenant to a registration plus a derived occupancy", () => {
    const out = mapped();
    expect(out.businessRegistrations).toHaveLength(1);
    expect(out.businessRegistrations[0]?.documentNumber).toBe("P05000046560");
    expect(out.businessRegistrationParties).toHaveLength(1);
    expect(out.businessRegistrationAddresses).toHaveLength(1);
    expect(out.occupancies).toHaveLength(1);
    expect(out.occupancies[0]?.occupancyType).toBe("sunbiz_business");
    expect(out.occupancies[0]?.propertyId).toBe(idFor.property(PID));
  });

  it("maps a bbb profile to a reputation profile with reviews, complaints, and a quality score", () => {
    const out = mapped();
    expect(out.businessReputationProfiles).toHaveLength(1);
    expect(out.businessReputationProfiles[0]?.bbbRating).toBe("F");
    expect(out.businessReputationReviews).toHaveLength(1);
    expect(out.businessReputationComplaints).toHaveLength(1);
    expect(out.contractorQualityScores).toHaveLength(1);
    expect(out.contractorQualityScores[0]?.scoreBand).toBe("poor");
  });

  it("is deterministic — identical input yields identical output", () => {
    expect(JSON.stringify(mapped())).toBe(JSON.stringify(mapped()));
  });

  it("skips records with no usable parcel key (blank identifier)", () => {
    const record = consolidatedPropertySchema.parse({
      ...RAW,
      parcel: { ...RAW.parcel, parcelIdentifier: "   " },
    });
    const out = emptyRowSets();
    mapRecord(record, CID, out);
    expect(out.parcels).toHaveLength(0);
    expect(out.properties).toHaveLength(0);
    expect(out.propertyImprovements).toHaveLength(0);
  });
});
