import { describe, expect, it } from "vitest";

import {
  buildTrustedReport,
  getTrustedReportSourceRequirements,
} from "@/features/reports/data/trusted-report";

type TrustedReportInput = Parameters<typeof buildTrustedReport>[0];

describe("Monthly Unit Profit & Loss", () => {
  it("uses only unit and ledger sources", () => {
    const requirements = getTrustedReportSourceRequirements(
      "unit-profit-loss",
    );

    expect(
      Object.entries(requirements)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
        .toSorted(),
    ).toEqual(["ledgerEntries", "units"]);
  });

  it("shows income, expenses, and net income by unit without report clutter", () => {
    const report = buildTrustedReport(reportInput());

    expect(report).toMatchObject({
      exportFilenameBase: "unit-profit-loss",
      kind: "unit-profit-loss",
      title: "Monthly Unit Profit & Loss",
    });
    expect(report.columns.map(({ label }) => label)).toEqual([
      "Property",
      "Unit",
      "Income",
      "Expenses",
      "Net income",
    ]);
    expect(report.rows[0]).toMatchObject({
      cells: {
        expenses: "USD 120.00",
        income: "USD 500.00",
        netIncome: "USD 380.00",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
      href: "/units/unit-1",
      id: "unit-1",
      tone: "success",
    });
    expect(report.rows[0]?.sourceLinks.map(({ recordType }) => recordType)).toEqual([
      "property",
      "unit",
      "ledger",
      "ledger",
    ]);
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Income", "USD 500.00"],
      ["Expenses", "USD 120.00"],
      ["Net income", "USD 380.00"],
      ["Units", "1"],
    ]);
    expect(report.unitProfitLossLines).toEqual([
      {
        amount: 500,
        category: "Rent",
        currency: "USD",
        date: "2026-07-05",
        description: "July rent",
        direction: "income",
        id: "ledger-income",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
      {
        amount: 120,
        category: "Repair",
        currency: "USD",
        date: "2026-07-10",
        description: "Repair",
        direction: "expense",
        id: "ledger-expense",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
    ]);

    const lines = report.unitProfitLossLines ?? [];
    expect(
      lines
        .filter(({ direction }) => direction === "income")
        .reduce((total, line) => total + line.amount, 0),
    ).toBe(500);
    expect(
      lines
        .filter(({ direction }) => direction === "expense")
        .reduce((total, line) => total + line.amount, 0),
    ).toBe(120);
  });

  it("does not silently assign property-level ledger rows to a unit", () => {
    const input = reportInput();
    input.ledgerEntries.push({
      amount: 999,
      category: "other",
      currency: "USD",
      description: "Unassigned property receipt",
      direction: "income",
      id: "ledger-unassigned",
      property_id: "property-1",
      transaction_date: "2026-07-20",
      unit_id: null,
    });

    const report = buildTrustedReport(input);

    expect(report.summary.find(({ label }) => label === "Income")?.value).toBe(
      "USD 500.00",
    );
    expect(report.totalsTraceLabel).toContain("2 unit-linked ledger rows");
    expect(report.unitProfitLossLines?.map(({ id }) => id)).not.toContain(
      "ledger-unassigned",
    );
  });

  it("preserves signed receipt-allocation reversals in detail and authoritative totals", () => {
    const input = reportInput();
    input.ledgerEntries.push({
      amount: -500,
      category: "rent",
      currency: "USD",
      description: "Receipt allocation reversal",
      direction: "income",
      id: "receipt-allocation-reversal",
      property_id: "property-1",
      transaction_date: "2026-07-20",
      unit_id: "unit-1",
    });

    const report = buildTrustedReport(input);
    const lines = report.unitProfitLossLines ?? [];
    const incomeDetailTotal = lines
      .filter(({ direction }) => direction === "income")
      .reduce((total, line) => total + line.amount, 0);

    expect(lines).toContainEqual({
      amount: -500,
      category: "Rent",
      currency: "USD",
      date: "2026-07-20",
      description: "Receipt allocation reversal",
      direction: "income",
      id: "receipt-allocation-reversal",
      property: "P1 - Property One",
      unit: "Unit A1",
    });
    expect(incomeDetailTotal).toBe(0);
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Income", "USD 0.00"],
      ["Expenses", "USD 120.00"],
      ["Net income", "-USD 120.00"],
      ["Units", "1"],
    ]);
  });
});

function reportInput(): TrustedReportInput {
  return {
    documents: [],
    generatedAt: "2026-08-01T00:00:00.000Z",
    ledgerEntries: [
      {
        amount: 500,
        category: "rent",
        currency: "USD",
        description: "July rent",
        direction: "income",
        id: "ledger-income",
        property_id: "property-1",
        transaction_date: "2026-07-05",
        unit_id: "unit-1",
      },
      {
        amount: 120,
        category: "repair",
        currency: "USD",
        description: "Repair",
        direction: "expense",
        id: "ledger-expense",
        property_id: "property-1",
        transaction_date: "2026-07-10",
        unit_id: "unit-1",
      },
    ],
    leases: [],
    maintenanceTasks: [],
    owners: [],
    people: [],
    periodEnd: "2026-07-31",
    periodStart: "2026-07-01",
    properties: [
      {
        code: "P1",
        id: "property-1",
        name: "Property One",
        owner: null,
        property_type: "Apartment",
        status: "active",
      },
    ],
    timelineEvents: [],
    units: [
      {
        current_rent_amount: null,
        current_rent_currency: null,
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 50,
        status: "occupied",
        unit_number: "A1",
      },
    ],
    viewQuery: {
      month: "2026-07",
      ownerPersonId: "all",
      peopleArchiveState: "active",
      peopleView: "relationship",
      propertyId: "all",
      report: "unit-profit-loss",
      status: "all",
      unitId: "all",
    },
  };
}
