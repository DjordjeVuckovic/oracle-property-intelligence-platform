import { z } from "zod";

// Zod contract for the consolidated per-property JSON record served from IPFS.
//
// Mirrors the `ConsolidatedProperty` type produced by
// elephant-query-db/scripts/run-property-consolidation-export.ts, but tolerant
// of the real payloads: nested array fields arrive as `null` (not `[]`) when
// empty, and numeric values arrive as strings ("258810.00"). The loader inverts
// the export's SQL field-by-field, so this schema is the shape it maps FROM.

// Coalesce a nullable/absent array to []. Verified against live records where
// e.g. permits[].inspections and bbbProfiles[].reviews were `null`.
const arr = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => v ?? []);

const str = z.string().nullish().transform((v) => v ?? null);
const num = z.number().nullish().transform((v) => v ?? null);
const bool = z.boolean().nullish().transform((v) => v ?? null);

const address = z.object({
  street: str,
  city: str,
  state: str,
  postalCode: str,
  latitude: str,
  longitude: str,
});

const property = z.object({
  propertyType: str,
  usageType: str,
  structureForm: str,
  buildStatus: str,
  builtYear: num,
  effectiveBuiltYear: num,
  historicDesignation: bool,
  livableArea: str,
  totalArea: str,
  areaUnderAir: str,
  numberOfUnits: num,
  subdivision: str,
  zoning: str,
  legalDescription: str,
});

const parcel = z.object({
  parcelIdentifier: z.string(),
  countyName: str,
  stateCode: str,
});

const geometry = z.object({ latitude: str, longitude: str }).nullish();

const ownership = z.object({
  ownedBy: str,
  ownershipPercentage: str,
  ownerOccupied: bool,
  dateAcquired: str,
  dateSold: str,
});

const tax = z.object({
  taxYear: num,
  assessedValue: str,
  marketValue: str,
  buildingValue: str,
  landValue: str,
  taxableValue: str,
  yearlyTaxAmount: str,
});

const sale = z.object({
  date: str,
  price: str,
  saleType: str,
  instrumentNumber: str,
});

const deed = z.object({ deedType: str, book: str, page: str, instrumentNumber: str });

const permitContact = z.object({
  contactRole: z.string(),
  rawName: str,
  phone: str,
  email: str,
  licenseNumber: str,
});

const permitEvent = z.object({
  eventType: z.string(),
  eventStatus: str,
  eventDate: str,
  actorName: str,
  commentText: str,
});

const permitFee = z.object({
  feeCode: str,
  feeDescription: str,
  feeStatus: str,
  assessedAmount: str,
  paidAmount: str,
});

const permitLink = z.object({ linkKind: z.string(), text: str, url: z.string(), title: str });

const inspection = z.object({
  inspectionNumber: str,
  inspectionStatus: str,
  inspectionType: str,
  completedDate: str,
  result: str,
  resultComment: str,
});

const permit = z.object({
  permitNumber: str,
  improvementType: str,
  completionDate: str,
  recordStatus: str,
  estimatedJobValue: str,
  estimatedSqFt: str,
  projectDescription: str,
  contacts: arr(permitContact),
  events: arr(permitEvent),
  fees: arr(permitFee),
  links: arr(permitLink),
  inspections: arr(inspection),
});

const sunbizAddress = z.object({
  addressRole: z.string(),
  line1: str,
  city: str,
  state: str,
  zip: str,
});

const sunbizParty = z.object({
  partyRole: z.string(),
  name: z.string(),
  title: str,
  addressSingleLine: str,
});

const sunbizAnnualReport = z.object({ reportYear: str, reportDate: str });

const sunbizTenant = z.object({
  documentNumber: z.string(),
  entityName: str,
  status: str,
  filingType: str,
  filedDate: str,
  addresses: arr(sunbizAddress),
  parties: arr(sunbizParty),
  annualReports: arr(sunbizAnnualReport),
});

const bbbReview = z.object({
  reviewDate: str,
  reviewRating: str,
  reviewTitle: str,
  reviewText: str,
  reviewerDisplayName: str,
});

const bbbComplaint = z.object({
  complaintDate: str,
  complaintType: str,
  complaintStatus: str,
  complaintSummary: str,
});

const bbbProfile = z.object({
  name: str,
  profileUrl: str,
  bbbRating: str,
  isAccredited: bool,
  reviewCount: num,
  complaintCount: num,
  qualityScore: str,
  scoreBand: str,
  reviews: arr(bbbReview),
  complaints: arr(bbbComplaint),
});

export const consolidatedPropertySchema = z.object({
  parcelId: str,
  county: z.string(),
  jurisdictionKey: str,
  sourceSystem: str,
  address,
  property,
  parcel,
  geometry,
  ownerships: arr(ownership),
  taxes: arr(tax),
  sales: arr(sale),
  deeds: arr(deed),
  permits: arr(permit),
  sunbizTenants: arr(sunbizTenant),
  bbbProfiles: arr(bbbProfile),
  collectedAt: z.string(),
});

export type ConsolidatedProperty = z.infer<typeof consolidatedPropertySchema>;
export type PermitRecord = z.infer<typeof permit>;
export type SunbizTenantRecord = z.infer<typeof sunbizTenant>;
export type BbbProfileRecord = z.infer<typeof bbbProfile>;
