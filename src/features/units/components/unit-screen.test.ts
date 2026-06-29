import { describe, expect, it } from "vitest";
import { getVacantUnitsReportHref } from "@/features/units/components/unit-screen";

describe("unit screen report links", () => {
  it("opens vacancy review units in the vacancy/risk report", () => {
    expect(getVacantUnitsReportHref("all")).toBe(
      "/reports?report=vacancy-risk&status=vacant",
    );
    expect(
      getVacantUnitsReportHref("8b3a08d2-0898-4de3-9495-994eaf7a08dc"),
    ).toBe(
      "/reports?report=vacancy-risk&status=vacant&propertyId=8b3a08d2-0898-4de3-9495-994eaf7a08dc",
    );
  });
});
