/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportsFilters } from "@/features/reports/components/reports-filters";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

afterEach(cleanup);

describe("ReportsFilters", () => {
  it("keeps property, month, and unit in one Unit P&L filter row", () => {
    renderFilters(query());

    const filters = screen.getByRole("region", { name: "Report filters" });
    expect(
      within(filters).getByRole("combobox", {
        name: "Filter report by property",
      }),
    ).toBeTruthy();
    expect(
      within(filters).getByRole("button", { name: "Report month" }),
    ).toBeTruthy();
    expect(
      within(filters).getByRole("combobox", {
        name: "Filter report by unit",
      }),
    ).toBeTruthy();
    expect(
      within(filters).getByRole("button", { name: "Apply filters" }),
    ).toBeTruthy();
  });

  it("omits unit scope from property-level statements", () => {
    renderFilters(query({ report: "management-fees" }));

    expect(
      screen.queryByRole("combobox", { name: "Filter report by unit" }),
    ).toBeNull();
  });
});

function renderFilters(viewQuery: ReportsViewQuery) {
  return render(
    <ReportsFilters
      action={`/reports/${viewQuery.report}`}
      propertyOptions={[
        { id: "property-1", label: "P1 - Property One" },
      ]}
      unitOptions={[
        {
          id: "unit-1",
          label: "P1 / Unit A1",
          propertyId: "property-1",
        },
      ]}
      viewQuery={viewQuery}
    />,
  );
}

function query(
  overrides: Partial<ReportsViewQuery> = {},
): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "unit-profit-loss",
    status: "all",
    unitId: "all",
    ...overrides,
  };
}
