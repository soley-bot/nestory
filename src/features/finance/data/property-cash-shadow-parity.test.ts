import { describe, expect, it } from "vitest";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import {
  buildPropertyCashShadowParity,
  type PropertyCashShadowParityInput,
} from "@/features/finance/data/property-cash-shadow-parity";
import type { FinanceInventoryPageRow } from "@/features/finance/inventory/finance-inventory";
import { buildTrustedReport } from "@/features/reports/data/trusted-report";
import { toOwnerStatementInput } from "@/features/reports/data/owner-statement-input";

type TrustedReportInput = Parameters<typeof buildTrustedReport>[0];
type OwnerStatementRows = Parameters<typeof toOwnerStatementInput>[0];
type PropertySummaryInput =
  PropertyCashShadowParityInput["propertySummaryInput"];

describe("property cash shadow parity", () => {
  it("uses the required basis, signs, nulls, and statuses for all 12 property cash fields", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          event({
            economicClass: "operating_income",
            eventKey: "receipt_allocation:rent",
            operatingCashEffectCents: BigInt(10_000),
            ownerCashEffectCents: BigInt(10_000),
            sourceId: "rent",
            sourceType: "receipt_allocation",
          }),
          event({
            economicClass: "management_fee",
            eventKey: "receipt_allocation:fee",
            managementFeeEffectCents: BigInt(1_000),
            ownerCashEffectCents: -BigInt(1_000),
            sourceId: "fee",
            sourceType: "receipt_allocation",
          }),
          event({
            economicClass: "owner_contribution",
            eventKey: "receipt_allocation:contribution",
            ownerCashEffectCents: BigInt(5_000),
            sourceId: "contribution",
            sourceType: "receipt_allocation",
          }),
          event({
            economicClass: "owner_distribution",
            eventKey: "payment_allocation:payout",
            ownerCashEffectCents: -BigInt(2_000),
            sourceId: "payout",
            sourceType: "payment_allocation",
          }),
          event({
            economicClass: "operating_expense",
            eventKey: "payment_allocation:expense",
            operatingCashEffectCents: -BigInt(3_000),
            ownerCashEffectCents: -BigInt(3_000),
            sourceId: "expense",
            sourceType: "payment_allocation",
          }),
          event({
            depositLiabilityEffectCents: BigInt(2_500),
            economicClass: "security_deposit",
            eventKey: "deposit_event:held",
            ownerCashEffectCents: BigInt(0),
            sourceId: "held",
            sourceType: "deposit_event",
          }),
        ],
      }),
    );

    const records = propertyCashRecords(result);
    expect(records).toHaveLength(12);
    expect(
      records.map((record) => [
        record.metric,
        record.basis,
        record.currentCents,
        record.canonicalCents,
        record.deltaCents,
        record.status,
      ]),
    ).toEqual([
      ["arrearsCents", "period_obligation", BigInt(0), null, null, "not_comparable"],
      [
        "managementFeesEarnedCents",
        "period_obligation",
        BigInt(1_000),
        null,
        null,
        "not_comparable",
      ],
      [
        "managementFeesOutstandingCents",
        "period_obligation",
        BigInt(0),
        null,
        null,
        "not_comparable",
      ],
      [
        "managementFeesReceivedCents",
        "period_flow",
        BigInt(1_000),
        BigInt(1_000),
        BigInt(0),
        "match",
      ],
      [
        "netOwnerCashMovementCents",
        "period_flow",
        BigInt(9_000),
        BigInt(9_000),
        BigInt(0),
        "match",
      ],
      [
        "operatingCashReceivedCents",
        "period_flow",
        BigInt(10_000),
        BigInt(10_000),
        BigInt(0),
        "match",
      ],
      [
        "ownerContributionCents",
        "period_flow",
        BigInt(5_000),
        BigInt(5_000),
        BigInt(0),
        "match",
      ],
      [
        "ownerPayoutCents",
        "period_flow",
        BigInt(2_000),
        BigInt(2_000),
        BigInt(0),
        "match",
      ],
      [
        "propertyExpensesPaidCents",
        "period_flow",
        BigInt(3_000),
        BigInt(3_000),
        BigInt(0),
        "match",
      ],
      ["rentDueCents", "period_obligation", BigInt(10_000), null, null, "not_comparable"],
      [
        "rentReceivedCents",
        "period_obligation",
        BigInt(10_000),
        null,
        null,
        "not_comparable",
      ],
      [
        "securityDepositHeldCents",
        "closing_balance",
        BigInt(2_500),
        null,
        null,
        "not_comparable",
      ],
    ]);
    expect(records.find((record) => record.metric === "ownerPayoutCents"))
      .toMatchObject({
        included: expect.arrayContaining([
          {
            eventKey: "payment_allocation:payout",
            kind: "canonical_event",
            sourceId: "payout",
            sourceType: "payment_allocation",
          },
          {
            id: "payout",
            kind: "current_cash_source",
            sourceType: "payment_allocation",
          },
        ]),
      });
  });

  it("retains original and reversal identities and fails closed on null canonical effects", async () => {
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          event({
            economicClass: "operating_income",
            eventKey: "receipt_allocation:original",
            operatingCashEffectCents: BigInt(10_000),
            ownerCashEffectCents: BigInt(10_000),
            sourceId: "original",
          }),
          event({
            economicClass: "operating_income",
            eventKey: "receipt_allocation:reversal",
            isReversal: true,
            operatingCashEffectCents: -BigInt(10_000),
            ownerCashEffectCents: -BigInt(10_000),
            reversalSourceId: "original",
            reversalSourceType: "receipt_allocation",
            sourceId: "reversal",
          }),
          event({
            classificationStatus: "unresolved_evidence",
            economicClass: "operating_income",
            eventKey: "ledger_entry:unknown",
            operatingCashEffectCents: null,
            ownerCashEffectCents: null,
            requiresResolution: true,
            sourceId: "unknown",
            sourceType: "ledger_entry",
          }),
        ],
      }),
    );
    const operating = propertyCashRecords(result).find(
      (record) => record.metric === "operatingCashReceivedCents",
    )!;

    expect(operating).toMatchObject({
      canonicalCents: null,
      currentCents: BigInt(10_000),
      deltaCents: null,
      included: expect.arrayContaining([
        expect.objectContaining({ eventKey: "receipt_allocation:original" }),
        expect.objectContaining({ eventKey: "receipt_allocation:reversal" }),
        expect.objectContaining({
          id: "rent",
          kind: "current_cash_source",
        }),
      ]),
      status: "unresolved",
      unresolved: [
        expect.objectContaining({ eventKey: "ledger_entry:unknown" }),
      ],
    });
  });

  it("keeps blocked owner allocation out of current totals without turning it into a zero mismatch", async () => {
    const blockedRows = ownerStatementRows();
    blockedRows.ownerRows[0]!.ownership_percent = "50";
    const result = await buildPropertyCashShadowParity(
      parityInput({ ownerStatementRows: blockedRows }),
    );

    expect(
      result.records.filter(
        (record) => record.surface === "owner_statement_allocation",
      ),
    ).toHaveLength(0);
    expect(
      result.records.find(
        (record) =>
          record.surface === "owner_statement_readiness" &&
          record.metric === "readiness",
      ),
    ).toMatchObject({
      currentCents: null,
      canonicalCents: null,
      deltaCents: null,
      status: "unresolved",
      unresolved: expect.arrayContaining([
        expect.objectContaining({
          id: "owner-link-1",
          kind: "owner_link",
          ownerPersonId: "owner-1",
        }),
      ]),
    });
    expect(
      result.records
        .filter(
          (record) =>
            record.surface === "owner_statement_allocation_integrity",
        )
        .every(
          (record) =>
            record.status === "unresolved" &&
            record.currentCents === null &&
            record.canonicalCents === null &&
            record.deltaCents === null,
        ),
    ).toBe(true);
  });

  it("emits owner allocation as not comparable and current allocation-integrity controls", async () => {
    const result = await buildPropertyCashShadowParity(parityInput());
    const allocation = result.records.find(
      (record) =>
        record.surface === "owner_statement_allocation" &&
        record.metric === "netOwnerCashMovementCents",
    );
    const integrity = result.records.find(
      (record) =>
        record.surface === "owner_statement_allocation_integrity" &&
        record.metric === "netOwnerCashMovementCents",
    );

    expect(allocation).toMatchObject({
      basis: "period_flow",
      canonicalCents: null,
      currentCents: BigInt(9_000),
      deltaCents: null,
      included: expect.arrayContaining([
        {
          id: "owner-link-1",
          kind: "owner_link",
          ownerPersonId: "owner-1",
        },
      ]),
      status: "not_comparable",
    });
    expect(integrity).toMatchObject({
      basis: "control",
      canonicalCents: null,
      currentCents: BigInt(9_000),
      deltaCents: null,
      referenceCents: BigInt(9_000),
      referenceDeltaCents: BigInt(0),
      status: "match",
    });
  });

  it("preserves a current archived-settlement mismatch", async () => {
    const result = await buildPropertyCashShadowParity(parityInput());
    const operating = propertyCashRecords(result).find(
      (record) => record.metric === "operatingCashReceivedCents",
    );

    expect(operating).toMatchObject({
      currentCents: BigInt(10_000),
      canonicalCents: BigInt(0),
      deltaCents: BigInt(10_000),
      status: "mismatch",
    });
  });

  it("builds all three trusted reports and separates Unit Performance summary from visible unit rows", async () => {
    const trustedInput = trustedReportInput();
    trustedInput.ledgerEntries.push(
      ledgerRow("ledger-property-income", 20, "income", null),
    );
    const sourceRows = [
      inventoryRow("sources", "ledger_entry:ledger-income", {
        amount: "100.00",
        archived: false,
        direction: "income",
        sourceId: "ledger-income",
        sourceType: "ledger_entry",
        unitId: "unit-1",
      }),
      inventoryRow("sources", "ledger_entry:ledger-expense", {
        amount: "30.00",
        archived: false,
        direction: "expense",
        sourceId: "ledger-expense",
        sourceType: "ledger_entry",
        unitId: "unit-1",
      }),
      inventoryRow("sources", "ledger_entry:ledger-property-income", {
        amount: "20.00",
        archived: false,
        direction: "income",
        sourceId: "ledger-property-income",
        sourceType: "ledger_entry",
        unitId: null,
      }),
    ];
    const result = await buildPropertyCashShadowParity(
      parityInput({
        canonicalEvents: [
          event({
            economicClass: "operating_income",
            eventKey: "receipt_allocation:unit-income",
            operatingCashEffectCents: BigInt(10_000),
            ownerCashEffectCents: BigInt(10_000),
            sourceId: "unit-income",
            unitId: "unit-1",
          }),
          event({
            economicClass: "operating_expense",
            eventKey: "payment_allocation:unit-expense",
            operatingCashEffectCents: -BigInt(3_000),
            ownerCashEffectCents: -BigInt(3_000),
            sourceId: "unit-expense",
            sourceType: "payment_allocation",
            unitId: "unit-1",
          }),
          event({
            economicClass: "operating_income",
            eventKey: "receipt_allocation:property-income",
            operatingCashEffectCents: BigInt(2_000),
            ownerCashEffectCents: BigInt(2_000),
            sourceId: "property-income",
            unitId: null,
          }),
        ],
        financeInventorySourceRows: sourceRows,
        trustedReportInput: trustedInput,
      }),
    );

    expect(reportMetrics(result, "unit_performance_summary")).toMatchObject({
      expenses: { currentCents: BigInt(3_000), canonicalCents: BigInt(3_000), status: "match" },
      income: { currentCents: BigInt(12_000), canonicalCents: BigInt(12_000), status: "match" },
      noi: { currentCents: BigInt(9_000), canonicalCents: BigInt(9_000), status: "match" },
    });
    expect(reportMetrics(result, "unit_performance_visible_rows")).toMatchObject({
      expenses: { currentCents: BigInt(3_000), canonicalCents: BigInt(3_000), status: "match" },
      income: { currentCents: BigInt(10_000), canonicalCents: BigInt(10_000), status: "match" },
      noi: { currentCents: BigInt(7_000), canonicalCents: BigInt(7_000), status: "match" },
    });
    expect(reportMetrics(result, "property_performance").noi.currentCents).toBe(
      BigInt(9_000),
    );
    expect(reportMetrics(result, "income_expense").noi.currentCents).toBe(
      BigInt(9_000),
    );
    expect(
      reportMetrics(result, "unit_performance_summary").income.included,
    ).toEqual(
      expect.arrayContaining([
        { kind: "plan01_source", stableKey: "ledger_entry:ledger-property-income" },
      ]),
    );
  });

  it("preserves Plan 01 bucket manifests, contradictions, load-limit diagnostics, unit context, and journal controls", async () => {
    const sourceRows = [
      inventoryRow("sources", "receipt_allocation:rent", {
        amount: "100.00",
        economicClass: "operating_income",
        signedAmount: "100.00",
        sourceType: "receipt_allocation",
        unitId: "unit-1",
      }),
      inventoryRow("sources", "receipt_allocation:missing-unit", {
        amount: "10.00",
        economicClass: "operating_income",
        incomeType: "rent",
        leaseId: "lease-2",
        signedAmount: "10.00",
        sourceType: "receipt_allocation",
      }),
      inventoryRow("sources", "journal_line:line-1", {
        creditAmount: "70.00",
        debitAmount: "70.00",
        journalEntryId: "journal-1",
        journalLineId: "line-1",
        sourceType: "journal_line",
      }),
    ];
    const diagnosticRows = [
      inventoryRow(
        "diagnostics",
        "REPORT_TOTAL_CONTRADICTION:property-1:2026-07-01",
        {
          issueCode: "REPORT_TOTAL_CONTRADICTION",
          ledgerAmount: "70.00",
          settlementAmount: "90.00",
        },
      ),
      inventoryRow(
        "diagnostics",
        "SOURCE_LOAD_LIMIT_EXCEEDED:ledger_entry",
        {
          issueCode: "SOURCE_LOAD_LIMIT_EXCEEDED",
          sourceRowCount: 5205,
        },
      ),
    ];
    const result = await buildPropertyCashShadowParity(
      parityInput({
        financeInventoryDiagnosticRows: diagnosticRows,
        financeInventorySourceRows: sourceRows,
      }),
    );

    expect(
      result.records.find(
        (record) =>
          record.surface === "plan01_diagnostic" &&
          record.metric === "REPORT_TOTAL_CONTRADICTION",
      ),
    ).toMatchObject({
      basis: "control",
      canonicalCents: null,
      currentCents: BigInt(7_000),
      deltaCents: null,
      referenceCents: BigInt(9_000),
      referenceDeltaCents: -BigInt(2_000),
      status: "mismatch",
      unresolved: [
        {
          issueCode: "REPORT_TOTAL_CONTRADICTION",
          kind: "plan01_diagnostic",
          stableKey: "REPORT_TOTAL_CONTRADICTION:property-1:2026-07-01",
        },
      ],
    });
    expect(
      result.records.find(
        (record) =>
          record.surface === "plan01_diagnostic" &&
          record.metric === "SOURCE_LOAD_LIMIT_EXCEEDED",
      ),
    ).toMatchObject({
      canonicalCents: null,
      currentCents: null,
      deltaCents: null,
      status: "unresolved",
    });
    expect(
      result.records.find(
        (record) =>
          record.surface === "plan01_parity" &&
          record.metric === "operatingIncomeReceived",
      ),
    ).toMatchObject({
      currentCents: BigInt(11_000),
      status: "not_comparable",
      included: [
        { kind: "plan01_source", stableKey: "receipt_allocation:missing-unit" },
        { kind: "plan01_source", stableKey: "receipt_allocation:rent" },
      ],
    });
    expect(
      result.records.find(
        (record) =>
          record.surface === "unit_context" &&
          record.metric === "receipt_allocation",
      ),
    ).toMatchObject({
      status: "unresolved",
      unresolved: [
        {
          kind: "plan01_source",
          stableKey: "receipt_allocation:missing-unit",
        },
      ],
    });
    expect(reportMetrics(result, "journal_control")).toMatchObject({
      balance: { currentCents: BigInt(0), canonicalCents: null, status: "match" },
      credit: {
        currentCents: BigInt(7_000),
        canonicalCents: null,
        status: "not_comparable",
      },
      debit: {
        currentCents: BigInt(7_000),
        canonicalCents: null,
        status: "not_comparable",
      },
    });
  });

  it("marks both PropertySummary all-time values not comparable to selected-period events", async () => {
    const result = await buildPropertyCashShadowParity(parityInput());

    expect(reportMetrics(result, "property_summary")).toMatchObject({
      netIncome: {
        basis: "control",
        currentCents: BigInt(7_000),
        canonicalCents: null,
        deltaCents: null,
        status: "not_comparable",
      },
      netIncomeUsd: {
        basis: "control",
        currentCents: BigInt(7_000),
        canonicalCents: null,
        deltaCents: null,
        status: "not_comparable",
      },
    });
  });

  it("keeps at least 5,205 exact identities without truncation and fails closed above 10,000", async () => {
    const manyEvents = Array.from({ length: 5_205 }, (_, index) =>
      event({
        economicClass: "operating_income",
        eventKey: `receipt_allocation:bulk-${index}`,
        operatingCashEffectCents: BigInt(1),
        ownerCashEffectCents: BigInt(1),
        sourceId: `bulk-${index}`,
      }),
    );
    const result = await buildPropertyCashShadowParity(
      parityInput({ canonicalEvents: manyEvents }),
    );
    expect(
      propertyCashRecords(result).find(
        (record) => record.metric === "operatingCashReceivedCents",
      )?.included.filter((identity) => identity.kind === "canonical_event"),
    ).toHaveLength(5_205);

    const tooManyEvents = Array.from({ length: 10_001 }, (_, index) =>
      event({
        economicClass: "operating_income",
        eventKey: `receipt_allocation:overflow-${index}`,
        operatingCashEffectCents: BigInt(1),
        ownerCashEffectCents: BigInt(1),
        sourceId: `overflow-${index}`,
      }),
    );
    await expect(
      buildPropertyCashShadowParity(
        parityInput({ canonicalEvents: tooManyEvents }),
      ),
    ).rejects.toThrow(/identity limit exceeded/i);
  });
});

function propertyCashRecords(
  result: Awaited<ReturnType<typeof buildPropertyCashShadowParity>>,
) {
  return result.records
    .filter((record) => record.surface === "property_cash")
    .toSorted((first, second) => first.metric.localeCompare(second.metric));
}

function reportMetrics(
  result: Awaited<ReturnType<typeof buildPropertyCashShadowParity>>,
  surface: string,
) {
  return Object.fromEntries(
    result.records
      .filter((record) => record.surface === surface)
      .map((record) => [record.metric, record]),
  );
}

function parityInput(
  overrides: Partial<PropertyCashShadowParityInput> = {},
): PropertyCashShadowParityInput {
  return {
    canonicalEvents: [],
    financeInventoryDiagnosticRows: [],
    financeInventorySourceRows: [],
    ownerStatementRows: ownerStatementRows(),
    propertySummaryInput: propertySummaryInput(),
    scope: {
      currency: "USD",
      organizationId: "organization-1",
      periodEnd: "2026-07-31",
      periodStart: "2026-07-01",
      propertyId: "property-1",
    },
    trustedReportInput: trustedReportInput(),
    ...overrides,
  };
}

function ownerStatementRows(): OwnerStatementRows {
  const rentItem = {
    amount_due: "100.00",
    due_date: "2026-07-01",
    id: "income-rent",
    income_type: "rent",
    property_id: "property-1",
  };
  const feeItem = {
    amount_due: "10.00",
    due_date: "2026-07-01",
    id: "income-fee",
    income_type: "management_fee",
    property_id: "property-1",
  };
  const contributionItem = {
    amount_due: "50.00",
    due_date: "2026-07-01",
    id: "income-contribution",
    income_type: "owner_contribution",
    property_id: "property-1",
  };

  return {
    contactRows: [],
    currentReceiptRows: [
      receiptRow("rent", "100.00", rentItem),
      receiptRow("fee", "10.00", feeItem),
      receiptRow("contribution", "50.00", contributionItem),
    ],
    depositRows: [
      {
        amount: "25.00",
        event_date: "2026-07-02",
        event_type: "received",
        id: "held",
        property_id: "property-1",
        reversal_of_id: null,
      },
    ],
    dueIncomeItems: [rentItem, feeItem, contributionItem],
    historicalReceiptRows: [],
    monthScope: { before: "2026-08-01", from: "2026-07-01" },
    ownerRows: [
      {
        archived_at: null,
        ended_on: null,
        id: "owner-link-1",
        is_primary: true,
        ownership_percent: "100",
        person_id: "owner-1",
        property_id: "property-1",
        started_on: "2020-01-01",
      },
    ],
    paymentRows: [
      paymentRow("expense", "30.00", "maintenance"),
      paymentRow("payout", "20.00", "owner_payout"),
    ],
    personRows: [
      {
        display_name: "Owner One",
        id: "owner-1",
        primary_email: "owner@example.com",
        primary_phone: null,
      },
    ],
    propertyIds: ["property-1"],
  };
}

function receiptRow(
  id: string,
  amount: string,
  item: OwnerStatementRows["dueIncomeItems"][number],
): OwnerStatementRows["currentReceiptRows"][number] {
  return {
    amount,
    finance_income_items: item,
    finance_receipts: {
      id: `receipt-${id}`,
      received_date: "2026-07-05",
      reversal_of_id: null,
    },
    id,
    income_item_id: item.id,
  };
}

function paymentRow(
  id: string,
  amount: string,
  expenseType: string,
): OwnerStatementRows["paymentRows"][number] {
  return {
    amount,
    expense_item_id: `expense-${id}`,
    finance_expense_items: {
      economic_scope: "property_expense",
      expense_type: expenseType,
      id: `expense-${id}`,
      property_id: "property-1",
    },
    finance_payments: {
      id: `payment-${id}`,
      paid_date: "2026-07-06",
      reversal_of_id: null,
    },
    id,
  };
}

function trustedReportInput(): TrustedReportInput {
  return {
    documents: [],
    generatedAt: "2026-08-01T00:00:00.000Z",
    ledgerEntries: [
      ledgerRow("ledger-income", 100, "income", "unit-1"),
      ledgerRow("ledger-expense", 30, "expense", "unit-1"),
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
        unit_number: "1A",
      },
    ],
    viewQuery: {
      month: "2026-07",
      ownerPersonId: "all",
      peopleArchiveState: "active",
      peopleView: "relationship",
      propertyId: "property-1",
      report: "property-performance",
      status: "all",
      unitId: "all",
    },
  };
}

function ledgerRow(
  id: string,
  amount: number,
  direction: string,
  unitId: string | null,
): TrustedReportInput["ledgerEntries"][number] {
  return {
    amount,
    category: direction === "income" ? "rent" : "maintenance",
    currency: "USD",
    description: id,
    direction,
    id,
    property_id: "property-1",
    transaction_date: "2026-07-10",
    unit_id: unitId,
  };
}

function propertySummaryInput(): PropertySummaryInput {
  return {
    activeOwner: null,
    hasActiveOwnerLink: false,
    ledgerEntries: [
      {
        amount: 100,
        currency: "USD",
        direction: "income",
        id: "summary-income",
      },
      {
        amount: 30,
        currency: "USD",
        direction: "expense",
        id: "summary-expense",
      },
    ],
    property: {
      address: null,
      code: "P1",
      id: "property-1",
      name: "Property One",
      owner: null,
      property_type: "Apartment",
      status: "active",
    },
    units: [{ status: "occupied" }],
  };
}

function inventoryRow(
  section: FinanceInventoryPageRow["section"],
  stableKey: string,
  payload: Record<string, unknown>,
): FinanceInventoryPageRow {
  return {
    contract_version: "finance_inventory_v2",
    payload,
    section,
    stable_key: stableKey,
  };
}

function event(
  overrides: Partial<PropertyCashEvent> & Pick<PropertyCashEvent, "eventKey" | "sourceId">,
): PropertyCashEvent {
  return {
    amountCents: BigInt(100),
    archivedAt: null,
    categoryCode: "test",
    classificationStatus: "source_stable",
    contractVersion: "property_cash_events_v1",
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: null,
    currency: "USD",
    depositLiabilityEffectCents: BigInt(0),
    economicClass: "operating_income",
    eventDate: "2026-07-01",
    isLegacy: false,
    isReversal: false,
    journalEntryId: null,
    leaseId: null,
    ledgerEntryId: null,
    managementFeeEffectCents: BigInt(0),
    obligationId: null,
    obligationType: null,
    operatingCashEffectCents: BigInt(0),
    organizationId: "organization-1",
    ownerCashEffectCents: BigInt(0),
    ownerPersonId: null,
    periodStart: "2026-07-01",
    projectionStatus: null,
    propertyId: "property-1",
    requiresResolution: false,
    reversalSourceId: null,
    reversalSourceType: null,
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_allocation",
    statementSection: "test",
    taskId: null,
    tenantPersonId: null,
    unitId: null,
    updatedAt: null,
    updatedBy: null,
    vendorPersonId: null,
    ...overrides,
  };
}
