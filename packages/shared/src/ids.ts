import { v5 as uuidv5 } from "uuid";

// Deterministic UUIDv5 identity so ingestion is idempotent: the same source
// entity always resolves to the same id across reruns, which lets the loader
// upsert instead of duplicating and lets the same contractor/business/BBB
// profile referenced by thousands of properties collapse to one row.
//
// Fixed project namespace (a random-but-frozen UUID). Never change it — doing
// so would re-key every entity in the database.
export const ORACLE_NAMESPACE = "b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c";

// Derive an id from an entity kind plus the stable source key that identifies
// that entity in its origin system. Kind is included so identical raw keys in
// different entity types never collide.
export function entityId(kind: string, sourceKey: string): string {
  return uuidv5(`${kind}:${sourceKey}`, ORACLE_NAMESPACE);
}

// Canonical per-entity keys (see the advisor's guidance): each must be stable
// and present in the source record before it is relied on.
export const idFor = {
  parcel: (parcelIdentifier: string) => entityId("parcel", parcelIdentifier),
  property: (parcelIdentifier: string) => entityId("property", parcelIdentifier),
  address: (normalizedAddressKey: string) => entityId("address", normalizedAddressKey),
  company: (normalizedName: string) => entityId("company", normalizedName),
  person: (normalizedName: string) => entityId("person", normalizedName),
  permit: (parcelIdentifier: string, permitNumber: string) =>
    entityId("permit", `${parcelIdentifier}|${permitNumber}`),
  businessRegistration: (documentNumber: string) =>
    entityId("business_registration", documentNumber),
  bbbProfile: (profileUrl: string) => entityId("bbb_profile", profileUrl),
  occupancy: (documentNumber: string, parcelIdentifier: string) =>
    entityId("occupancy", `${documentNumber}|${parcelIdentifier}`),
} as const;
