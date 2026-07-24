/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportsFilters } from "@/features/reports/components/reports-filters";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

afterEach(cleanup);

describe("ReportsFilters", () => {
  it("shows visible scope labels and names the preview action", () => {
    render(
      <ReportsFilters
        action="/reports/rent-roll"
        propertyOptions={[
          { id: "52b1ed33-0ac8-4c3d-9d9d-631e9f557014", label: "P1" },
        ]}
        showReportSelect={false}
        viewQuery={query("rent-roll")}
      />,
    );

    expect(screen.getByText("Property")).toBeTruthy();
    expect(screen.getByText("Month")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter report by property" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report month" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter units by status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate preview" })).toBeTruthy();
  });

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

  it("uses People-specific view and archive filters without unrelated property scope", () => {
    render(
      <ReportsFilters
        action="/reports/people-readiness"
        propertyOptions={[]}
        showReportSelect={false}
        viewQuery={{
          ...query("rent-roll"),
          peopleArchiveState: "all",
          peopleView: "staff",
          report: "people-readiness",
        }}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Choose People readiness view" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter People records by state" }),
    ).toBeTruthy();
    expect(screen.queryByText("Property")).toBeNull();
    expect(screen.queryByText("Month")).toBeNull();
    expect(screen.queryByText("Status")).toBeNull();
  });
});

function query(report: ReportsViewQuery["report"]): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report,
    status: "all",
    unitId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
  };
}
