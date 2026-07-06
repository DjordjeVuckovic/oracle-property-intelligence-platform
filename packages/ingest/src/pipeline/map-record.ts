import { idFor, type ConsolidatedProperty } from "@oracle/shared";
import type { schema } from "@oracle/db";
import type { InferInsertModel } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  buildNormalizedAddressKey,
  hashNormalizedAddressKey,
  normalizeName,
  normalizeParcelIdentifier,
} from "../lib/normalizers.js";
import { classifyPermitStatus, extractContractorCompany } from "../lib/derive.js";
import { dateStr, ipfsUri, numStr, sourceMeta } from "../lib/source.js";

// Inverse of run-property-consolidation-export.ts: turn one consolidated IPFS
// record back into the row sets of the ported schema. Pure and deterministic —
// no DB, no clock, no randomness — so it is unit-tested against fixtures.

type Ins<T extends PgTable> = InferInsertModel<T>;

export type RowSets = {
  parcels: Ins<typeof schema.parcels>[];
  properties: Ins<typeof schema.properties>[];
  addresses: Ins<typeof schema.addresses>[];
  ownerships: Ins<typeof schema.ownerships>[];
  taxes: Ins<typeof schema.taxes>[];
  salesHistories: Ins<typeof schema.salesHistories>[];
  deeds: Ins<typeof schema.deeds>[];
  companies: Ins<typeof schema.companies>[];
  propertyImprovements: Ins<typeof schema.propertyImprovements>[];
  inspections: Ins<typeof schema.inspections>[];
  permitEvents: Ins<typeof schema.permitEvents>[];
  permitFees: Ins<typeof schema.permitFees>[];
  permitLinks: Ins<typeof schema.permitLinks>[];
  permitContacts: Ins<typeof schema.permitContacts>[];
  businessRegistrations: Ins<typeof schema.businessRegistrations>[];
  businessRegistrationParties: Ins<typeof schema.businessRegistrationParties>[];
  businessRegistrationAnnualReports: Ins<typeof schema.businessRegistrationAnnualReports>[];
  businessRegistrationAddresses: Ins<typeof schema.businessRegistrationAddresses>[];
  businessReputationProfiles: Ins<typeof schema.businessReputationProfiles>[];
  businessReputationReviews: Ins<typeof schema.businessReputationReviews>[];
  businessReputationComplaints: Ins<typeof schema.businessReputationComplaints>[];
  contractorQualityScores: Ins<typeof schema.contractorQualityScores>[];
  occupancies: Ins<typeof schema.occupancies>[];
};

export function emptyRowSets(): RowSets {
  return {
    parcels: [],
    properties: [],
    addresses: [],
    ownerships: [],
    taxes: [],
    salesHistories: [],
    deeds: [],
    companies: [],
    propertyImprovements: [],
    inspections: [],
    permitEvents: [],
    permitFees: [],
    permitLinks: [],
    permitContacts: [],
    businessRegistrations: [],
    businessRegistrationParties: [],
    businessRegistrationAnnualReports: [],
    businessRegistrationAddresses: [],
    businessReputationProfiles: [],
    businessReputationReviews: [],
    businessReputationComplaints: [],
    contractorQualityScores: [],
    occupancies: [],
  };
}

const CONTRACTOR_ROLES = ["LICENSED_PROFESSIONAL", "CONTRACTOR", "APPLICANT"];

function timestampDate(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function mapRecord(record: ConsolidatedProperty, cid: string, out: RowSets): void {
  const pid = normalizeParcelIdentifier(record.parcel.parcelIdentifier);
  if (!pid) return; // no stable parcel key → cannot place the record

  const uri = ipfsUri(cid);
  const appraiser = record.sourceSystem ?? "lee_appraiser";
  const parcelId = idFor.parcel(pid);
  const propertyId = idFor.property(pid);

  // --- address ---
  const a = record.address;
  const addrKey =
    buildNormalizedAddressKey(
      [a.street, a.city, a.state, a.postalCode].filter(Boolean).join(" ")
    ) ?? `parcel:${pid}`;
  const addressId = idFor.address(addrKey);
  const lat = record.geometry?.latitude ?? a.latitude;
  const lng = record.geometry?.longitude ?? a.longitude;
  out.addresses.push({
    addressId,
    cityName: a.city,
    stateCode: a.state,
    postalCode: a.postalCode,
    latitude: numStr(lat),
    longitude: numStr(lng),
    countyName: record.parcel.countyName ?? "Lee",
    unnormalizedAddress: a.street,
    normalizedAddressKey: addrKey,
    normalizedAddressHash: hashNormalizedAddressKey(addrKey),
    ...sourceMeta(appraiser, `address:${addrKey}`, a, uri),
  });

  // --- parcel ---
  out.parcels.push({
    parcelId,
    requestIdentifier: pid,
    parcelIdentifier: pid,
    countyName: record.parcel.countyName ?? "Lee",
    stateCode: record.parcel.stateCode,
    jurisdictionKey: record.jurisdictionKey,
    ...sourceMeta(appraiser, `parcel:${pid}`, record.parcel, uri),
  });

  // --- property ---
  const p = record.property;
  out.properties.push({
    propertyId,
    parcelId,
    addressId,
    parcelIdentifier: pid,
    propertyType: p.propertyType,
    propertyUsageType: p.usageType,
    structureForm: p.structureForm,
    buildStatus: p.buildStatus,
    propertyLegalDescriptionText: p.legalDescription,
    propertyStructureBuiltYear: p.builtYear,
    propertyEffectiveBuiltYear: p.effectiveBuiltYear,
    historicDesignation: p.historicDesignation,
    livableFloorArea: p.livableArea,
    areaUnderAir: p.areaUnderAir,
    totalArea: p.totalArea,
    numberOfUnits: p.numberOfUnits,
    subdivision: p.subdivision,
    zoning: p.zoning,
    ...sourceMeta(appraiser, `property:${pid}`, p, uri),
  });

  // --- ownerships ---
  record.ownerships.forEach((o, i) => {
    out.ownerships.push({
      propertyId,
      ownedBy: o.ownedBy,
      ownershipPercentage: numStr(o.ownershipPercentage),
      ownerOccupiedIndicator: o.ownerOccupied,
      dateAcquired: dateStr(o.dateAcquired),
      dateSold: dateStr(o.dateSold),
      ...sourceMeta(appraiser, `ownership:${pid}:${i}`, o, uri),
    });
  });

  // --- taxes ---
  record.taxes.forEach((t, i) => {
    out.taxes.push({
      propertyId,
      taxYear: t.taxYear,
      propertyAssessedValueAmount: numStr(t.assessedValue),
      propertyMarketValueAmount: numStr(t.marketValue),
      propertyBuildingAmount: numStr(t.buildingValue),
      propertyLandAmount: numStr(t.landValue),
      propertyTaxableValueAmount: numStr(t.taxableValue),
      yearlyTaxAmount: numStr(t.yearlyTaxAmount),
      ...sourceMeta(appraiser, `tax:${pid}:${t.taxYear ?? i}`, t, uri),
    });
  });

  // --- sales ---
  record.sales.forEach((s, i) => {
    out.salesHistories.push({
      propertyId,
      ownershipTransferDate: dateStr(s.date),
      purchasePriceAmount: numStr(s.price),
      saleType: s.saleType,
      instrumentNumber: s.instrumentNumber,
      ...sourceMeta(appraiser, `sale:${pid}:${s.instrumentNumber ?? i}`, s, uri),
    });
  });

  // --- deeds ---
  record.deeds.forEach((d, i) => {
    out.deeds.push({
      propertyId,
      deedType: d.deedType,
      book: d.book,
      page: d.page,
      instrumentNumber: d.instrumentNumber,
      ...sourceMeta(appraiser, `deed:${pid}:${d.instrumentNumber ?? i}`, d, uri),
    });
  });

  // --- permits (property_improvements) + children ---
  record.permits.forEach((permit, pi) => {
    const permitKey = permit.permitNumber ?? `idx${pi}`;
    const permitId = idFor.permit(pid, permitKey);
    const permitSource = "lee_accela";

    // Contractor company from the first contractor-role contact we can parse.
    let contractorCompanyId: string | null = null;
    permit.contacts.forEach((c, ci) => {
      const company =
        CONTRACTOR_ROLES.includes(c.contactRole) ? extractContractorCompany(c.rawName) : null;
      let companyId: string | null = null;
      if (company) {
        companyId = idFor.company(company);
        out.companies.push({
          companyId,
          name: company,
          normalizedName: company,
          ...sourceMeta(permitSource, `company:${company}`, { name: company }, uri),
        });
        if (!contractorCompanyId) contractorCompanyId = companyId;
      }
      out.permitContacts.push({
        propertyImprovementId: permitId,
        contactRole: c.contactRole,
        companyId,
        rawName: c.rawName,
        phone: c.phone,
        email: c.email,
        licenseNumber: c.licenseNumber,
        ...sourceMeta(permitSource, `permit_contact:${permitKey}:${ci}`, c, uri),
      });
    });

    const firstUrl = permit.links.find((l) => l.url)?.url ?? null;
    out.propertyImprovements.push({
      propertyImprovementId: permitId,
      propertyId,
      parcelId,
      addressId,
      contractorCompanyId,
      parcelIdentifier: pid,
      permitNumber: permit.permitNumber,
      improvementType: permit.improvementType,
      improvementStatus: classifyPermitStatus(permit.recordStatus),
      recordStatus: permit.recordStatus,
      completionDate: dateStr(permit.completionDate),
      estimatedJobValue: numStr(permit.estimatedJobValue),
      estimatedSqFt: numStr(permit.estimatedSqFt),
      projectDescription: permit.projectDescription,
      sourceUrl: firstUrl,
      ...sourceMeta(permitSource, `permit:${pid}:${permitKey}`, permit, uri),
    });

    permit.inspections.forEach((ins, ii) => {
      out.inspections.push({
        propertyImprovementId: permitId,
        inspectionNumber: ins.inspectionNumber,
        inspectionStatus: ins.inspectionStatus,
        inspectionType: ins.inspectionType,
        completedDate: dateStr(ins.completedDate),
        result: ins.result,
        resultComment: ins.resultComment,
        ...sourceMeta(permitSource, `inspection:${permitKey}:${ins.inspectionNumber ?? ii}`, ins, uri),
      });
    });

    permit.events.forEach((event, ei) => {
      out.permitEvents.push({
        propertyImprovementId: permitId,
        eventType: event.eventType,
        eventStatus: event.eventStatus,
        eventDate: timestampDate(dateStr(event.eventDate)),
        actorName: event.actorName,
        commentText: event.commentText,
        ...sourceMeta(permitSource, `permit_event:${permitKey}:${event.eventType ?? ei}`, event, uri),
      });
    });

    permit.fees.forEach((fee, fi) => {
      out.permitFees.push({
        propertyImprovementId: permitId,
        feeCode: fee.feeCode,
        feeDescription: fee.feeDescription,
        feeStatus: fee.feeStatus,
        assessedAmount: numStr(fee.assessedAmount),
        paidAmount: numStr(fee.paidAmount),
        ...sourceMeta(permitSource, `permit_fee:${permitKey}:${fee.feeCode ?? fi}`, fee, uri),
      });
    });

    permit.links.forEach((link, li) => {
      if (!link.url) return;
      out.permitLinks.push({
        propertyImprovementId: permitId,
        linkKind: link.linkKind,
        text: link.text,
        url: link.url,
        title: link.title,
        ...sourceMeta(permitSource, `permit_link:${permitKey}:${li}`, link, uri),
      });
    });
  });

  // --- sunbiz tenants → business_registrations + children + occupancies ---
  record.sunbizTenants.forEach((tenant) => {
    const doc = tenant.documentNumber;
    const brId = idFor.businessRegistration(doc);
    const companyName = normalizeName(tenant.entityName);
    const companyId = companyName ? idFor.company(companyName) : null;
    if (companyName && companyId) {
      out.companies.push({
        companyId,
        name: tenant.entityName,
        normalizedName: companyName,
        ...sourceMeta("sunbiz", `company:${companyName}`, { name: tenant.entityName }, uri),
      });
    }
    out.businessRegistrations.push({
      businessRegistrationId: brId,
      companyId,
      requestIdentifier: doc,
      documentNumber: doc,
      entityName: tenant.entityName,
      status: tenant.status,
      filingType: tenant.filingType,
      filedDate: dateStr(tenant.filedDate),
      ...sourceMeta("sunbiz", `business_registration:${doc}`, tenant, uri),
    });
    tenant.parties.forEach((party, i) => {
      out.businessRegistrationParties.push({
        businessRegistrationId: brId,
        requestIdentifier: doc,
        documentNumber: doc,
        partyRole: party.partyRole,
        name: party.name,
        normalizedName: normalizeName(party.name),
        title: party.title,
        addressSingleLine: party.addressSingleLine,
        ...sourceMeta("sunbiz", `br_party:${doc}:${i}`, party, uri),
      });
    });
    tenant.annualReports.forEach((ar, i) => {
      out.businessRegistrationAnnualReports.push({
        businessRegistrationId: brId,
        documentNumber: doc,
        reportOrdinal: i + 1,
        reportYear: ar.reportYear,
        reportDate: dateStr(ar.reportDate),
        ...sourceMeta("sunbiz", `br_annual_report:${doc}:${i}`, ar, uri),
      });
    });
    tenant.addresses.forEach((addr, i) => {
      out.businessRegistrationAddresses.push({
        businessRegistrationId: brId,
        requestIdentifier: doc,
        documentNumber: doc,
        addressRole: addr.addressRole,
        line1: addr.line1,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        ...sourceMeta("sunbiz", `br_address:${doc}:${i}`, addr, uri),
      });
    });
    // Derived occupancy: this business is inferred to occupy the property.
    out.occupancies.push({
      occupancyId: idFor.occupancy(doc, pid),
      businessRegistrationId: brId,
      companyId,
      propertyId,
      parcelIdentifier: pid,
      normalizedAddressKey: addrKey,
      occupancyType: "sunbiz_business",
      ...sourceMeta("sunbiz", `occupancy:${doc}:${pid}`, { doc, pid }, uri),
    });
  });

  // --- bbb profiles → companies + reputation profiles + reviews/complaints/scores ---
  record.bbbProfiles.forEach((bbb, bi) => {
    const bbbKey = bbb.profileUrl ?? bbb.name ?? `bbb:${pid}:${bi}`;
    const bbbId = idFor.bbbProfile(bbbKey);
    const companyName = normalizeName(bbb.name);
    const companyId = companyName ? idFor.company(companyName) : null;
    if (companyName && companyId) {
      out.companies.push({
        companyId,
        name: bbb.name,
        normalizedName: companyName,
        ...sourceMeta("bbb", `company:${companyName}`, { name: bbb.name }, uri),
      });
    }
    out.businessReputationProfiles.push({
      businessReputationProfileId: bbbId,
      companyId,
      provider: "bbb",
      profileUrl: bbb.profileUrl,
      name: bbb.name,
      normalizedName: companyName,
      isAccredited: bbb.isAccredited,
      bbbRating: bbb.bbbRating,
      reviewCount: bbb.reviewCount,
      complaintCount: bbb.complaintCount,
      ...sourceMeta("bbb", `bbb_profile:${bbbKey}`, bbb, uri),
    });
    if (bbb.qualityScore !== null || bbb.scoreBand !== null) {
      out.contractorQualityScores.push({
        companyId,
        businessReputationProfileId: bbbId,
        scoringModel: "bbb_quality_v1",
        score: numStr(bbb.qualityScore),
        scoreBand: bbb.scoreBand,
        ...sourceMeta("bbb", `quality_score:${bbbKey}`, bbb, uri),
      });
    }
    bbb.reviews.forEach((r, ri) => {
      out.businessReputationReviews.push({
        businessReputationProfileId: bbbId,
        reviewDate: dateStr(r.reviewDate),
        reviewRating: numStr(r.reviewRating),
        reviewTitle: r.reviewTitle,
        reviewText: r.reviewText,
        reviewerDisplayName: r.reviewerDisplayName,
        ...sourceMeta("bbb", `bbb_review:${bbbKey}:${ri}`, r, uri),
      });
    });
    bbb.complaints.forEach((c, ci) => {
      out.businessReputationComplaints.push({
        businessReputationProfileId: bbbId,
        complaintDate: dateStr(c.complaintDate),
        complaintType: c.complaintType,
        complaintStatus: c.complaintStatus,
        complaintSummary: c.complaintSummary,
        ...sourceMeta("bbb", `bbb_complaint:${bbbKey}:${ci}`, c, uri),
      });
    });
  });
}
