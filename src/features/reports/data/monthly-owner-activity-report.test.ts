import { describe, expect, it } from "vitest";

import { buildMonthlyOwnerActivityReport } from "@/features/reports/data/monthly-owner-activity-report";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

describe("owner activity report", () => {
  it("mirrors the property account categories operators use", () => {
    const report = buildMonthlyOwnerActivityReport({
      entries: [
        entry("rent_income", 800, 800),
        entry("management_fee_expense", 80, -80),
        entry("owner_expense", 120, -120),
        entry("withdrawal", 200, -200),
      ],
      ownerAssignments: new Map([
        ["property-1", { name: "Maly Chen", personId: "owner-1" }],
      ]),
      period: { end: "2026-08-31", start: "2026-08-01" },
      properties: [
        { code: "RIV", id: "property-1", name: "Riverside Apartments" },
      ],
      viewQuery: query(),
    });

    expect(report.kind).toBe("monthly-owner-activity");
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Rent", "USD 800.00"],
      ["Management fee", "USD 80.00"],
      ["Property costs", "USD 120.00"],
      ["Owner distributions", "USD 200.00"],
    ]);
    expect(report.rows[0]?.cells).toMatchObject({
      managementFees: "USD 80.00",
      netChange: "USD 400.00",
      owner: "Maly Chen",
      propertyCosts: "USD 120.00",
      rent: "USD 800.00",
      withdrawals: "USD 200.00",
    });
    expect(report.rows[0]?.href).toBe(
      "/properties/property-1/account?activity=all&month=2026-08&ownerPersonId=owner-1",
    );
  });

  it("reconciles net change from the displayed components including cost corrections", () => {
    const report = buildMonthlyOwnerActivityReport({
      entries: [
        entry("rent_income", 1_725, 1_725, "rent-1"),
        entry("management_fee_expense", 145, -145, "fee-1"),
        entry("owner_expense", 125, -125, "cost-1"),
        entry("owner_expense_reversal", -100, 100, "cost-correction-1"),
        entry("withdrawal", 350, -350, "distribution-1"),
      ],
      ownerAssignments: new Map([
        ["property-1", { name: "Sokha Vannak", personId: "owner-1" }],
      ]),
      period: { end: "2026-09-30", start: "2026-09-01" },
      properties: [
        { code: "CTR-RES", id: "property-1", name: "Central Residence" },
      ],
      viewQuery: query({ month: "2026-09" }),
    });

    const cells = report.rows[0]!.cells;
    expect(cells).toMatchObject({
      managementFees: "USD 145.00",
      netChange: "USD 1,205.00",
      propertyCosts: "USD 25.00",
      rent: "USD 1,725.00",
      withdrawals: "USD 350.00",
    });
    expect(
      money(cells.rent) -
        money(cells.managementFees) -
        money(cells.propertyCosts) -
        money(cells.withdrawals),
    ).toBe(money(cells.netChange));
    expect(report.rows[0]?.sourceLinks).toHaveLength(5);
    expect(report.rows[0]?.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: "01 Sept 2026 · USD 100.00 increase",
          href: "/properties/property-1/account?activity=corrections&month=2026-09&ownerPersonId=owner-1",
          id: "expense_customer_adjustment:cost-correction-1",
          label: "Expense reversal",
        }),
      ]),
    );
    expect(report.rows[0]?.sourceSummary).toBe("5 source records");
    expect(report.ownerOptions).toEqual([
      { id: "owner-1", label: "Sokha Vannak" },
    ]);
  });

  it("filters owner activity by the selected primary owner", () => {
    const report = buildMonthlyOwnerActivityReport({
      entries: [
        entry("rent_income", 800, 800, "rent-1", "property-1"),
        entry("rent_income", 900, 900, "rent-2", "property-2"),
      ],
      ownerAssignments: new Map([
        ["property-1", { name: "Maly Chen", personId: "owner-1" }],
        ["property-2", { name: "Sokha Vannak", personId: "owner-2" }],
      ]),
      period: { end: "2026-08-31", start: "2026-08-01" },
      properties: [
        { code: "RIV", id: "property-1", name: "Riverside Apartments" },
        { code: "CTR", id: "property-2", name: "Central Residence" },
      ],
      viewQuery: query({ ownerPersonId: "owner-2" }),
    });

    expect(report.rows.map(({ propertyId }) => propertyId)).toEqual([
      "property-2",
    ]);
    expect(report.scopeLabel).toBe("Sokha Vannak · All properties");
    expect(report.ownerOptions).toEqual([
      { id: "owner-1", label: "Maly Chen" },
      { id: "owner-2", label: "Sokha Vannak" },
    ]);
  });

  it("does not fill the report with zero rows", () => {
    const report = buildMonthlyOwnerActivityReport({
      entries: [],
      ownerAssignments: new Map([
        ["property-1", { name: "Maly Chen", personId: "owner-1" }],
      ]),
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

function entry(
  category: string,
  amount: number,
  balanceEffect: number,
  sourceId = `${category}-1`,
  propertyId = "property-1",
) {
  const sourceTypeByCategory: Record<string, string> = {
    management_fee_expense: "management_fee_occurrence",
    owner_expense: "ips_expense_responsibility",
    owner_expense_reversal: "expense_customer_adjustment",
    rent_income: "tenant_invoice_payment",
    withdrawal: "property_withdrawal",
  };
  return {
    amount,
    balance_effect: balanceEffect,
    category,
    event_date: "2026-09-01",
    label: category === "owner_expense_reversal" ? "Expense reversal" : category,
    property_id: propertyId,
    source_id: sourceId,
    source_type: sourceTypeByCategory[category] ?? "unknown",
  };
}

function query(overrides: Partial<ReportsViewQuery> = {}): ReportsViewQuery {
  return {
    month: "2026-08",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "monthly-owner-activity",
    status: "all",
    unitId: "all",
    ...overrides,
  };
}

function money(value: string | undefined) {
  return Number(value?.replace(/[^0-9.-]/g, "") ?? 0);
}
