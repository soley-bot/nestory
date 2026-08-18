import { describe, expect, it } from "vitest";

import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";

describe("entity option labels", () => {
  it("leads a property label with the name it is recognised by", () => {
    expect(
      formatPropertyOptionLabel({ code: "HOME", name: "Home Residence" }),
    ).toBe("Home Residence — HOME");
  });

  it("leads a unit label with the unit, then its property code", () => {
    expect(
      formatUnitOptionLabel({ propertyCode: "HOME", unitNumber: "12" }),
    ).toBe("Unit 12 — HOME");
  });

  it("uses the canonical missing-property fallback without exposing an id", () => {
    expect(formatUnitOptionLabel({ unitNumber: "12" })).toBe(
      "Unit 12 — Unknown property",
    );
    expect(
      formatUnitOptionLabel({ propertyCode: null, unitNumber: "12" }),
    ).toBe("Unit 12 — Unknown property");
  });
});
