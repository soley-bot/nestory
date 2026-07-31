import { describe, expect, it } from "vitest";
import { buildPropertyStatementHref } from "@/features/properties/components/property-detail-view";
import { buildUnitProfitLossHref } from "@/features/units/components/unit-detail-view";

describe("record detail report links", () => {
  it("opens each property statement in the three-report workspace", () => {
    expect(
      buildPropertyStatementHref(
        "property-1",
        "unit-profit-loss",
        "2026-07",
      ),
    ).toBe(
      "/reports/unit-profit-loss?month=2026-07&propertyId=property-1",
    );
    expect(
      buildPropertyStatementHref(
        "property-1",
        "owner-statement",
        "2026-07",
      ),
    ).toBe(
      "/reports/owner-statement?month=2026-07&propertyId=property-1",
    );
    expect(
      buildPropertyStatementHref(
        "property-1",
        "management-fees",
        "2026-07",
      ),
    ).toBe(
      "/reports/management-fees?month=2026-07&propertyId=property-1",
    );
  });

  it("opens a unit directly in Monthly Unit Profit & Loss", () => {
    expect(
      buildUnitProfitLossHref(
        { id: "unit-1", propertyId: "property-1" },
        "2026-07",
      ),
    ).toBe(
      "/reports/unit-profit-loss?month=2026-07&propertyId=property-1&unitId=unit-1",
    );
  });
});
