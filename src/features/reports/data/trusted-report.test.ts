import { describe, expect, it } from "vitest";

import type { OwnerProfitLossEvent } from "@/features/reports/data/owner-profit-loss-events.types";
import {
  buildTrustedReport,
  getTrustedReportSourceRequirements,
} from "@/features/reports/data/trusted-report";

type TrustedReportInput = Parameters<typeof buildTrustedReport>[0];

describe("Monthly Unit Profit & Loss", () => {
  it("uses only units and the recognized owner P&L authority", () => {
    const requirements = getTrustedReportSourceRequirements("unit-profit-loss");

    expect(
      Object.entries(requirements)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
        .toSorted(),
    ).toEqual(["ownerProfitLossEvents", "units"]);
  });

  it("shows signed recognition by unit and explicit property-level scope", () => {
    const report = buildTrustedReport(reportInput());

    expect(report).toMatchObject({
      exportFilenameBase: "unit-profit-loss",
      kind: "unit-profit-loss",
      title: "Monthly Unit Profit & Loss",
    });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({
      cells: {
        expenses: "USD 40.00",
        income: "USD 400.00",
        netIncome: "USD 360.00",
        property: "P1 - Property One",
        unit: "Unit A1",
      },
      href: "/units/unit-1",
      id: "unit-1",
      tone: "success",
    });
    expect(report.rows[1]).toMatchObject({
      cells: {
        expenses: "USD 120.00",
        income: "USD 0.00",
        netIncome: "-USD 120.00",
        property: "P1 - Property One",
        unit: "Property-level",
      },
      href: "/properties/property-1",
      id: "property-level:property-1",
      tone: "danger",
    });
    expect(report.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Income", "USD 400.00"],
      ["Expenses", "USD 160.00"],
      ["Net income", "USD 240.00"],
      ["Scopes", "2"],
    ]);
    expect(report.totalsTraceLabel).toContain("5 recognized owner event");
    expect(report.totalsTraceLabel).toContain("1 property-level event");
  });

  it("keeps reversal signs and immutable source identities in detail", () => {
    const report = buildTrustedReport(reportInput());

    expect(report.unitProfitLossLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: BigInt(-10_000),
          direction: "income",
          id: "tenant_invoice_line:rent-reversal",
        }),
        expect.objectContaining({
          amountCents: BigInt(-1_000),
          direction: "expense",
          id: "management_fee_occurrence:fee-reversal",
        }),
        expect.objectContaining({
          amountCents: BigInt(12_000),
          direction: "expense",
          id: "owner_invoice_line:owner-expense",
          unit: "Property-level",
        }),
      ]),
    );
    expect(
      report.rows.flatMap((row) => row.sourceLinks).map(({ recordType }) => recordType),
    ).toEqual(
      expect.arrayContaining(["income-obligation", "expense-obligation"]),
    );
  });

  it("shows the configured category label while retaining stable report identity", () => {
    const input = reportInput();
    const customExpense = input.ownerProfitLossEvents?.find(
      ({ sourceId }) => sourceId === "owner-expense",
    );
    Object.assign(customExpense ?? {}, {
      categoryCode: "custom_grounds_authority",
      categoryId: "category-grounds",
      categoryLabel: "Grounds care",
      categoryReportingGroup: "maintenance",
    });

    const report = buildTrustedReport(input);

    expect(report.unitProfitLossLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Grounds care",
          categoryCode: "custom_grounds_authority",
          id: "owner_invoice_line:owner-expense",
          reportingGroup: "maintenance",
        }),
      ]),
    );
    expect(report.rows.flatMap((row) => row.sourceLinks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "owner-expense",
          label: "Maintenance · Grounds care owner invoice line",
        }),
      ]),
    );
  });

  it("keeps property-level activity in the selected unit's property only", () => {
    const input = reportInput();
    input.properties.push({
      code: "P2",
      id: "property-2",
      name: "Property Two",
      owner: null,
      property_type: "Apartment",
      status: "active",
    });
    input.ownerProfitLossEvents?.push(
      event("other-property-expense", {
        economicClass: "owner_expense",
        propertyId: "property-2",
        signedAmountCents: BigInt(99_900),
        sourceType: "owner_invoice_line",
        unitId: null,
      }),
    );

    const report = buildTrustedReport(input);

    expect(report.rows.map(({ id }) => id)).toEqual([
      "unit-1",
      "property-level:property-1",
    ]);
    expect(report.summary.find(({ label }) => label === "Expenses")?.value).toBe(
      "USD 160.00",
    );
  });

  it("formats exact bigint cents beyond Number.MAX_SAFE_INTEGER", () => {
    const input = reportInput();
    input.ownerProfitLossEvents = [
      event("large-income", {
        signedAmountCents: BigInt("900719925474099300"),
      }),
      event("large-expense", {
        economicClass: "owner_expense",
        signedAmountCents: BigInt("900719925474099101"),
        sourceType: "owner_invoice_line",
      }),
    ];

    const report = buildTrustedReport(input);

    expect(report.rows[0]?.cells).toMatchObject({
      expenses: "USD 9,007,199,254,740,991.01",
      income: "USD 9,007,199,254,740,993.00",
      netIncome: "USD 1.99",
    });
  });

  it("keeps all-unit scope summarized without line-detail payload", () => {
    const input = reportInput();
    input.viewQuery.unitId = "all";

    const report = buildTrustedReport(input);

    expect(report.unitProfitLossDetailScope).toBeUndefined();
    expect(report.unitProfitLossLines).toBeUndefined();
  });
});

function event(
  sourceId: string,
  overrides: Partial<OwnerProfitLossEvent> = {},
): OwnerProfitLossEvent {
  const sourceType = overrides.sourceType ?? "tenant_invoice_line";

  return {
    categoryCode: "rent",
    categoryId: null,
    categoryLabel: "Rent",
    categoryReportingGroup: "rent",
    contractVersion: "owner_profit_loss_events.v2",
    currency: "USD",
    description: "Tenant - Rent",
    economicClass: "owner_income",
    eventKey: `${sourceType}:${sourceId}`,
    isReversal: false,
    leaseId: null,
    organizationId: "organization-1",
    periodStart: "2026-07-01",
    propertyId: "property-1",
    recognitionBasis: "tenant_invoice_issued",
    recognizedOn: "2026-07-15",
    reversalOfId: null,
    reversalSourceType: null,
    signedAmountCents: BigInt(50_000),
    sourceId,
    sourceParentId: null,
    sourceParentType: null,
    sourceType,
    unitId: "unit-1",
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
    ownerProfitLossEvents: [
      event("rent-original"),
      event("rent-reversal", {
        isReversal: true,
        reversalOfId: "rent-original",
        reversalSourceType: "tenant_invoice_line",
        signedAmountCents: BigInt(-10_000),
      }),
      event("fee-original", {
        categoryCode: "management_fee",
        description: "Management fee",
        economicClass: "owner_expense",
        recognitionBasis: "management_fee_earned_at_invoice_issuance",
        signedAmountCents: BigInt(5_000),
        sourceType: "management_fee_occurrence",
      }),
      event("fee-reversal", {
        categoryCode: "management_fee",
        description: "Management fee",
        economicClass: "owner_expense",
        isReversal: true,
        recognitionBasis: "management_fee_earned_at_invoice_issuance",
        reversalOfId: "fee-original",
        reversalSourceType: "management_fee_occurrence",
        signedAmountCents: BigInt(-1_000),
        sourceType: "management_fee_occurrence",
      }),
      event("owner-expense", {
        categoryCode: "repairs_maintenance",
        description: "Company-advanced roof repair",
        economicClass: "owner_expense",
        recognitionBasis: "owner_responsibility_obligation",
        signedAmountCents: BigInt(12_000),
        sourceType: "owner_invoice_line",
        unitId: null,
      }),
    ],
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
    propertyCashEvents: [],
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
