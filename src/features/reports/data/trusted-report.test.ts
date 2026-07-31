import { describe, expect, it } from "vitest";

import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import {
  buildTrustedReport,
  getTrustedReportSourceRequirements,
} from "@/features/reports/data/trusted-report";

type TrustedReportInput = Parameters<typeof buildTrustedReport>[0];

describe("Monthly Unit Profit & Loss", () => {
  it("uses only units and canonical property cash events", () => {
    const requirements = getTrustedReportSourceRequirements(
      "unit-profit-loss",
    );

    expect(
      Object.entries(requirements)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
        .toSorted(),
    ).toEqual(["propertyCashEvents", "units"]);
  });

  it("shows canonical operating income, expense magnitude, and net income by unit", () => {
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
    expect(
      report.rows[0]?.sourceLinks.map(({ recordType }) => recordType),
    ).toEqual([
      "property",
      "unit",
      "receipt-allocation",
      "payment-allocation",
    ]);
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Income", "USD 500.00"],
      ["Expenses", "USD 120.00"],
      ["Net income", "USD 380.00"],
      ["Units", "1"],
    ]);
    expect(report.unitProfitLossLines).toEqual([
      {
        amountCents: BigInt(50_000),
        category: "Rent",
        currency: "USD",
        date: "2026-07-15",
        description: "Receipt Allocation",
        direction: "income",
        id: "receipt_allocation:income-source",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
      {
        amountCents: BigInt(12_000),
        category: "Repair",
        currency: "USD",
        date: "2026-07-15",
        description: "Payment Allocation",
        direction: "expense",
        id: "payment_allocation:expense-source",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
    ]);

    const lines = report.unitProfitLossLines ?? [];
    expect(
      lines
        .filter(({ direction }) => direction === "income")
        .reduce((total, line) => total + line.amountCents, BigInt(0)),
    ).toBe(BigInt(50_000));
    expect(
      lines
        .filter(({ direction }) => direction === "expense")
        .reduce((total, line) => total + line.amountCents, BigInt(0)),
    ).toBe(BigInt(12_000));
  });

  it("does not silently assign property-level canonical events to a unit", () => {
    const input = reportInput();
    input.propertyCashEvents!.push(
      cashEvent("property-income", {
        operatingCashEffectCents: BigInt(99_900),
        unitId: null,
      }),
    );

    const report = buildTrustedReport(input);

    expect(report.summary.find(({ label }) => label === "Income")?.value).toBe(
      "USD 500.00",
    );
    expect(report.totalsTraceLabel).toContain(
      "2 canonical unit-linked operating cash events",
    );
    expect(report.totalsTraceLabel).toContain(
      "1 property-level event excluded",
    );
  });

  it("excludes unresolved canonical-looking events and preserves income and expense reversal signs", () => {
    const input = reportInput();
    input.propertyCashEvents!.push(
      cashEvent("unresolved-income", {
        operatingCashEffectCents: BigInt(7_500),
        reconciliationState: "missing_stable_identity",
        requiresResolution: true,
        resolutionCodes: ["missing_reconciliation_source"],
      }),
      cashEvent("owner-funding", {
        economicClass: "owner_contribution",
        operatingCashEffectCents: BigInt(25_000),
      }),
      cashEvent("rent-reversal", {
        isReversal: true,
        operatingCashEffectCents: BigInt(-5_000),
      }),
      cashEvent("expense-reversal", {
        economicClass: "operating_expense",
        isReversal: true,
        operatingCashEffectCents: BigInt(2_000),
        sourceType: "payment_allocation",
      }),
    );

    const report = buildTrustedReport(input);

    expect(report.rows[0]?.cells).toMatchObject({
      expenses: "USD 100.00",
      income: "USD 450.00",
      netIncome: "USD 350.00",
    });
    expect(
      report.rows[0]?.sourceLinks
        .filter(({ recordType }) =>
          ["receipt-allocation", "payment-allocation"].includes(recordType),
        )
        .map(({ id }) => id),
    ).toEqual([
      "income-source",
      "expense-source",
      "rent-reversal",
      "expense-reversal",
    ]);
    expect(report.totalsTraceLabel).toContain(
      "2 non-operating or unresolved unit-linked events excluded",
    );
    expect(report.unitProfitLossLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: BigInt(-5_000),
          direction: "income",
          id: "receipt_allocation:rent-reversal",
        }),
        expect.objectContaining({
          amountCents: BigInt(-2_000),
          direction: "expense",
          id: "payment_allocation:expense-reversal",
        }),
      ]),
    );
  });

  it("retains exact canonical event source identities and operator links", () => {
    const report = buildTrustedReport(reportInput());
    const incomeSource = report.rows[0]?.sourceLinks.find(
      ({ id }) => id === "income-source",
    );
    const expenseSource = report.rows[0]?.sourceLinks.find(
      ({ id }) => id === "expense-source",
    );

    expect(incomeSource).toEqual({
      href:
        "/rent-income?archiveState=all&month=2026-07&propertyId=property-1&unitId=unit-1",
      id: "income-source",
      label: "Rent receipt allocation",
      recordType: "receipt-allocation",
    });
    expect(expenseSource).toEqual({
      href:
        "/bills-expenses?archiveState=all&dateBasis=paid&month=2026-07&propertyId=property-1&unitId=unit-1",
      id: "expense-source",
      label: "Repair payment allocation",
      recordType: "payment-allocation",
    });
  });

  it("formats bigint cents exactly beyond Number.MAX_SAFE_INTEGER", () => {
    const input = reportInput();
    input.propertyCashEvents = [
      cashEvent("large-income", {
        amountCents: BigInt("900719925474099300"),
        operatingCashEffectCents: BigInt("900719925474099300"),
        ownerCashEffectCents: BigInt("900719925474099300"),
      }),
      cashEvent("large-expense", {
        amountCents: BigInt("900719925474099101"),
        economicClass: "operating_expense",
        operatingCashEffectCents: BigInt("-900719925474099101"),
        ownerCashEffectCents: BigInt("-900719925474099101"),
        sourceType: "payment_allocation",
        statementSection: "expense",
      }),
    ];

    const report = buildTrustedReport(input);

    expect(report.rows[0]?.cells).toMatchObject({
      expenses: "USD 9,007,199,254,740,991.01",
      income: "USD 9,007,199,254,740,993.00",
      netIncome: "USD 1.99",
    });
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Income", "USD 9,007,199,254,740,993.00"],
      ["Expenses", "USD 9,007,199,254,740,991.01"],
      ["Net income", "USD 1.99"],
      ["Units", "1"],
    ]);
    expect(
      report.unitProfitLossLines?.map(({ amountCents }) => amountCents),
    ).toEqual(
      expect.arrayContaining([
        BigInt("900719925474099300"),
        BigInt("900719925474099101"),
      ]),
    );
  });

  it("keeps all-unit scope on the traceable summary contract", () => {
    const input = reportInput();
    input.viewQuery.unitId = "all";

    const report = buildTrustedReport(input);

    expect(report.unitProfitLossDetailScope).toBeUndefined();
    expect(report.unitProfitLossLines).toBeUndefined();
  });
});

function cashEvent(
  sourceId: string,
  overrides: Partial<PropertyCashEvent> = {},
): PropertyCashEvent {
  const sourceType = overrides.sourceType ?? "receipt_allocation";

  return {
    amountCents: BigInt(50_000),
    archivedAt: null,
    categoryCode: "rent",
    classificationStatus: "source_stable",
    contractVersion: "property_cash_events_v1",
    createdAt: "2026-07-01T00:00:00Z",
    createdBy: null,
    currency: "USD",
    depositLiabilityEffectCents: BigInt(0),
    economicClass: "operating_income",
    eventDate: "2026-07-15",
    eventKey: `${sourceType}:${sourceId}`,
    isLegacy: false,
    isReversal: false,
    journalEntryId: null,
    leaseId: null,
    ledgerEntryId: null,
    managementFeeEffectCents: BigInt(0),
    obligationId: null,
    obligationType: null,
    operatingCashEffectCents: BigInt(50_000),
    organizationId: "organization-1",
    ownerCashEffectCents: BigInt(50_000),
    ownerPersonId: null,
    periodStart: "2026-07-01",
    projectionStatus: null,
    propertyId: "property-1",
    reconciliationSourceId: null,
    reconciliationState: "not_required",
    requiresResolution: false,
    resolutionCodes: [],
    reversalSourceId: null,
    reversalSourceType: null,
    sourceId,
    sourceParentId: null,
    sourceParentType: null,
    sourceType,
    statementSection: "income",
    taskId: null,
    tenantPersonId: null,
    unitId: "unit-1",
    updatedAt: null,
    updatedBy: null,
    vendorPersonId: null,
    ...overrides,
  };
}

function reportInput(): TrustedReportInput {
  return {
    documents: [],
    generatedAt: "2026-08-01T00:00:00.000Z",
    ledgerEntries: [],
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
    propertyCashEvents: [
      cashEvent("income-source"),
      cashEvent("expense-source", {
        amountCents: BigInt(12_000),
        categoryCode: "repair",
        economicClass: "operating_expense",
        operatingCashEffectCents: BigInt(-12_000),
        ownerCashEffectCents: BigInt(-12_000),
        sourceType: "payment_allocation",
        statementSection: "expense",
      }),
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
      unitId: "unit-1",
    },
  };
}
