/* @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportsFilters } from "@/features/reports/components/reports-filters";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

afterEach(cleanup);

describe("ReportsFilters", () => {
  it("omits stale unit scope for Owner Statements", () => {
    const { container } = render(
      <ReportsFilters
        propertyOptions={[]}
        viewQuery={query("owner-statement")}
      />,
    );

    expect(container.querySelector('input[name="unitId"]')).toBeNull();
  });

  it("preserves unit scope for reports that support it", () => {
    const { container } = render(
      <ReportsFilters
        propertyOptions={[]}
        viewQuery={query("unit-performance")}
      />,
    );

    expect(
      container.querySelector('input[name="unitId"]')?.getAttribute("value"),
    ).toBe("8b3a08d2-0898-4de3-9495-994eaf7a08dc");
  });
});

function query(report: ReportsViewQuery["report"]): ReportsViewQuery {
  return {
    month: "2026-07",
    propertyId: "all",
    report,
    status: "all",
    unitId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
  };
}
