import { describe, expect, it } from "vitest";

import { buildOwnerActivityReport } from "@/features/reports/data/owner-activity-report";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

describe("owner activity report", () => {
  it("mirrors the property account categories operators use", () => {
    const report = buildOwnerActivityReport({
      entries: [
        entry("rent_income", 800, 800),
        entry("management_fee_expense", 80, -80),
        entry("owner_expense", 120, -120),
        entry("withdrawal", 200, -200),
      ],
      ownerNames: new Map([["property-1", "Maly Chen"]]),
      period: { end: "2026-08-31", start: "2026-08-01" },
      properties: [
        { code: "RIV", id: "property-1", name: "Riverside Apartments" },
      ],
      viewQuery: query(),
    });

    expect(report.kind).toBe("owner-activity");
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Rent", "USD 800.00"],
      ["Management fee", "USD 80.00"],
      ["Property costs", "USD 120.00"],
      ["Withdrawals", "USD 200.00"],
    ]);
    expect(report.rows[0]?.cells).toMatchObject({
      managementFees: "USD 80.00",
      netChange: "USD 400.00",
      owner: "Maly Chen",
      propertyCosts: "USD 120.00",
      rent: "USD 800.00",
      withdrawals: "USD 200.00",
    });
    expect(report.rows[0]?.href).toBe("/properties/property-1/account");
  });

  it("does not fill the report with zero rows", () => {
    const report = buildOwnerActivityReport({
      entries: [],
      ownerNames: new Map([["property-1", "Maly Chen"]]),
      period: { end: "2026-08-31", start: "2026-08-01" },
      properties: [
        { code: "RIV", id: "property-1", name: "Riverside Apartments" },
      ],
      viewQuery: query(),
    });

    expect(report.rows).toEqual([]);
    expect(report.emptyTitle).toBe("No owner activity this month");
  });
});

function entry(category: string, amount: number, balanceEffect: number) {
  return {
    amount,
    balance_effect: balanceEffect,
    category,
    property_id: "property-1",
    source_id: `${category}-1`,
  };
}

function query(): ReportsViewQuery {
  return {
    month: "2026-08",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "owner-activity",
    status: "all",
    unitId: "all",
  };
}
