import { describe, expect, it } from "vitest";

import {
  buildReportBuilderHref,
  reportCatalog,
  reportKindValues,
} from "@/features/reports/report-catalog";

describe("report catalog", () => {
  it("keeps two useful reports in the visible workspace", () => {
    expect(reportKindValues).toEqual([
      "owner-activity",
      "unit-profit-loss",
    ]);
    expect(reportCatalog.map(({ title }) => title)).toEqual([
      "Owner activity",
      "Monthly Unit Profit & Loss",
    ]);
  });
});

describe("buildReportBuilderHref", () => {
  it("keeps unit scope only on Monthly Unit Profit & Loss links", () => {
    const query = new URLSearchParams({
      month: "2026-07",
      ownerPersonId: "owner-person-1",
      propertyId: "property-1",
      unitId: "unit-1",
    });

    expect(buildReportBuilderHref("unit-profit-loss", query)).toBe(
      "/reports/unit-profit-loss?month=2026-07&propertyId=property-1&unitId=unit-1",
    );
    expect(buildReportBuilderHref("owner-activity", query)).toBe(
      "/reports/owner-activity?month=2026-07&propertyId=property-1",
    );
  });
});
