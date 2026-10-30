import { describe, expect, it } from "vitest";
import { getSavedViewResource, sanitizeViewQuery } from "./saved-views";

describe("saved view preferences", () => {
  it("allows only supported registers and reports", () => {
    expect(getSavedViewResource("/units")?.permission).toBe("properties.view");
    expect(getSavedViewResource("/reports/unit-profit-loss")?.permission).toBe("finance.publish");
    expect(getSavedViewResource("/units/some-id")).toBeUndefined();
    expect(getSavedViewResource("https://outside.test")).toBeUndefined();
  });
  it("keeps reusable filters but never creation commands, identities, financial intent, or pagination", () => {
    const query = new URLSearchParams(sanitizeViewQuery("/units", "propertyId=one&occupancy=unoccupied&sort=unit_asc&page=9&action=create&userId=someone&organizationId=other&financialGeneration=9&unitId=detail&token=secret"));
    expect(Object.fromEntries(query)).toEqual({ propertyId: "one", occupancy: "unoccupied", sort: "unit_asc" });
  });
  it("bounds untrusted preference values and rejects unsupported resources", () => {
    expect(() => sanitizeViewQuery("/units", `query=${"x".repeat(1001)}`)).toThrow();
    expect(() => sanitizeViewQuery("/unknown", "query=hello")).toThrow();
  });
});
