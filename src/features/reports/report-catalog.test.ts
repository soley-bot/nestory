import { describe, expect, it } from "vitest";

import { buildReportBuilderHref } from "@/features/reports/report-catalog";

describe("buildReportBuilderHref", () => {
  it("removes stale unit scope from generated Owner Statement links", () => {
    const query = new URLSearchParams({
      month: "2026-07",
      propertyId: "property-1",
      unitId: "unit-1",
    });

    expect(buildReportBuilderHref("owner-statement", query)).toBe(
      "/reports/owner-statement?month=2026-07&propertyId=property-1",
    );
    expect(buildReportBuilderHref("unit-performance", query)).toContain(
      "unitId=unit-1",
    );
  });
});
