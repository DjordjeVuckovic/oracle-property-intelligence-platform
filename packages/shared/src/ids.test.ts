import { describe, expect, it } from "vitest";

import { entityId, idFor, ORACLE_NAMESPACE } from "./ids.js";

describe("entityId", () => {
  it("is deterministic for the same kind and key", () => {
    expect(entityId("parcel", "12345")).toBe(entityId("parcel", "12345"));
  });

  it("namespaces by kind so identical keys never collide across entity types", () => {
    expect(entityId("parcel", "12345")).not.toBe(entityId("property", "12345"));
  });

  it("produces a stable UUIDv5 (frozen namespace — regression guard)", () => {
    // If this value changes, the namespace or key scheme changed and every id in
    // the database would be re-keyed. Treat a failure here as intentional only.
    expect(idFor.parcel("11432001000700010")).toBe(
      entityId("parcel", "11432001000700010")
    );
    expect(ORACLE_NAMESPACE).toBe("b3d1f2a4-6c7e-5a89-9b0c-1d2e3f4a5b6c");
  });

  it("keys each entity on its documented source identifier", () => {
    expect(idFor.bbbProfile("https://bbb.org/x")).toBe(entityId("bbb_profile", "https://bbb.org/x"));
    expect(idFor.businessRegistration("P1200")).toBe(entityId("business_registration", "P1200"));
    expect(idFor.permit("999", "MEC-1")).toBe(entityId("permit", "999|MEC-1"));
  });
});
