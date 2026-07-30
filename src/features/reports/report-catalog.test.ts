import { describe, expect, it } from "vitest";

import {
  buildReportBuilderHref,
  reportCatalog,
  reportKindValues,
} from "@/features/reports/report-catalog";

describe("report catalog", () => {
  it("offers only the three reports required by the operating brief", () => {
    expect(reportKindValues).toEqual([
      "unit-profit-loss",
      "owner-statement",
      "management-fees",
    ]);
    expect(reportCatalog.map(({ title }) => title)).toEqual([
      "Monthly Unit Profit & Loss",
      "Owner Statement",
      "Management Fee Statement",
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
    expect(buildReportBuilderHref("owner-statement", query)).toBe(
      "/reports/owner-statement?month=2026-07&propertyId=property-1",
    );
    expect(buildReportBuilderHref("management-fees", query)).toBe(
      "/reports/management-fees?month=2026-07&propertyId=property-1",
    );
  });
});
