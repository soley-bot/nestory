import { describe, expect, it } from "vitest";

import {
  formatPropertyOptionLabel,
  formatUnitOptionLabel,
} from "@/lib/entity-option-labels";

describe("entity option labels", () => {
  it("formats a property with its operator-facing code and name", () => {
    expect(
      formatPropertyOptionLabel({ code: "HOME", name: "Home Residence" }),
    ).toBe("HOME — Home Residence");
  });

  it("formats a unit with its property code and explicit Unit prefix", () => {
    expect(
      formatUnitOptionLabel({ propertyCode: "HOME", unitNumber: "12" }),
    ).toBe("HOME — Unit 12");
  });

  it("uses the canonical missing-property fallback without exposing an id", () => {
    expect(formatUnitOptionLabel({ unitNumber: "12" })).toBe(
      "Unknown property — Unit 12",
    );
    expect(
      formatUnitOptionLabel({ propertyCode: null, unitNumber: "12" }),
    ).toBe("Unknown property — Unit 12");
  });
});
