import { describe, expect, it } from "vitest";

import {
  buildOverviewPropertyPerformance,
  type OverviewPropertyPerformanceInput,
} from "@/features/overview/property-performance";

const propertyId = "property-1";

describe("buildOverviewPropertyPerformance", () => {
  it("calculates owner cash without deposits or owner contributions", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        depositEvents: [depositEvent(1_400)],
        expenseItems: [
          expense("cleaning"),
          expense("building"),
          expense("repairs"),
        ],
        incomeItems: [
          income("rent", 1_400),
          income("security-deposit", 1_400, "security_deposit"),
          income("owner-contribution", 500, "owner_contribution"),
          income("management-fee", 112, "management_fee"),
        ],
        paymentAllocations: [
          payment("cleaning", 50),
          payment("building", 327.6),
          payment("repairs", 83),
        ],
        receiptAllocations: [
          receipt("rent", 1_400),
          receipt("security-deposit", 1_400),
          receipt("owner-contribution", 500),
          receipt("management-fee", 112),
        ],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      cashExpensesAmount: 572.6,
      cashIncomeAmount: 1_400,
      managementFeeEarnedAmount: 112,
      managementFeeReceivedAmount: 112,
      managementFeeOutstandingAmount: 0,
      netCashAmount: 827.4,
      securityDepositHeldAmount: 1_400,
    });
    expect(result.rows[0]?.cashIncome.primary).toBe("USD 1,400.00");
  });

  it("uses charge allocations for collection rate and arrears", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        incomeItems: [income("rent-one", 1_000), income("rent-two", 400)],
        receiptAllocations: [receipt("rent-one", 900)],
      }),
    );

    expect(result.rows[0]?.collectionRate).toBe(64);
    expect(result.rows[0]?.arrearsAmount).toBe(500);
    expect(result.rows[0]?.status).toBe("arrears");
  });

  it("keeps collection facts at period end while recognizing settlement cash", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        incomeItems: [
          income("june-rent", 100, "rent", propertyId, "2026-06-15"),
          income("july-rent", 200, "rent", propertyId, "2026-07-15"),
        ],
        receiptAllocations: [
          receipt("june-rent", 100, false, "2026-07-03"),
          receipt("july-rent", 200, false, "2026-08-03"),
        ],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      arrearsAmount: 200,
      cashIncomeAmount: 100,
      collectionRate: 0,
    });
  });

  it("recognizes receipt and payment reversals in the reversal month", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        monthScope: { before: "2026-09-01", from: "2026-08-01" },
        expenseItems: [expense("repair")],
        incomeItems: [income("june-rent", 100, "rent", propertyId, "2026-06-15")],
        paymentAllocations: [
          payment("repair", 50, false, "2026-07-04"),
          payment("repair", 50, true, "2026-08-04"),
        ],
        receiptAllocations: [
          receipt("june-rent", 100, false, "2026-07-03"),
          receipt("june-rent", 100, true, "2026-08-03"),
        ],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      cashExpensesAmount: -50,
      cashIncomeAmount: -100,
      collectionRate: 0,
      netCashAmount: -50,
    });
  });

  it.each([
    "management_fee",
    "leasing_commission",
    "service_fee",
    "maintenance_markup",
  ])("treats %s as a management-company fee", (feeType) => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        incomeItems: [income(feeType, 25, feeType)],
        receiptAllocations: [receipt(feeType, 25)],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      cashExpensesAmount: 25,
      cashIncomeAmount: 0,
      managementFeeEarnedAmount: 25,
      managementFeeReceivedAmount: 25,
      managementFeeOutstandingAmount: 0,
    });
  });

  it("separates earned, received, and outstanding management fees", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        incomeItems: [income("fee", 100, "management_fee")],
        receiptAllocations: [receipt("fee", 40)],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      managementFeeEarnedAmount: 100,
      managementFeeReceived: { primary: "USD 40.00" },
      managementFeeReceivedAmount: 40,
      managementFeeOutstandingAmount: 60,
    });
    expect(result.summary).toMatchObject({
      managementFeeEarnedAmount: 100,
      managementFeeReceivedAmount: 40,
      managementFeeOutstandingAmount: 60,
    });
  });

  it("subtracts traceable reversals from cash, fees, and deposits", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        depositEvents: [
          depositEvent(700),
          depositEvent(700, "reversed", "received"),
        ],
        expenseItems: [expense("repair"), expense("company", "company_cost")],
        incomeItems: [
          income("rent", 1_000),
          income("management-fee", 80, "management_fee"),
        ],
        paymentAllocations: [
          payment("repair", 200),
          payment("repair", 200, true),
          payment("company", 90),
        ],
        receiptAllocations: [
          receipt("rent", 1_000),
          receipt("rent", 250, true),
          receipt("management-fee", 80),
          receipt("management-fee", 20, true),
        ],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      arrearsAmount: 250,
      cashExpensesAmount: 60,
      cashIncomeAmount: 750,
      managementFeeEarnedAmount: 80,
      managementFeeReceivedAmount: 60,
      managementFeeOutstandingAmount: 20,
      netCashAmount: 690,
      securityDepositHeldAmount: 0,
    });
  });

  it("rejects a malformed deposit reversal instead of increasing held cash", () => {
    const malformedEvent = {
      amount: 700,
      event_date: "2026-07-10",
      event_type: "reversed",
      property_id: propertyId,
      reversed_event_type: null,
    } as unknown as OverviewPropertyPerformanceInput["depositEvents"][number];

    expect(() =>
      buildOverviewPropertyPerformance(fixture({ depositEvents: [malformedEvent] })),
    ).toThrow("Deposit reversal must identify the reversed event type");
  });

  it("filters every review and ranks weak properties deterministically", () => {
    const input = fixture({
      expenseItems: [
        expense("loss-expense", "property_expense", "loss-property"),
      ],
      incomeItems: [
        income("loss-rent", 100, "rent", "loss-property"),
        income("arrears-rent", 100, "rent", "arrears-property"),
        income("blocked-rent", 100, "rent", "blocked-property"),
        income("healthy-b-rent", 100, "rent", "healthy-b"),
        income("healthy-a-rent", 100, "rent", "healthy-a"),
      ],
      openBills: [{ property_id: "blocked-property" }],
      paymentAllocations: [payment("loss-expense", 150)],
      properties: [
        { code: "LOSS", id: "loss-property", name: "Loss" },
        { code: "ARR", id: "arrears-property", name: "Arrears" },
        { code: "BLK", id: "blocked-property", name: "Blocked" },
        { code: "B", id: "healthy-b", name: "Healthy B" },
        { code: "A", id: "healthy-a", name: "Healthy A" },
      ],
      receiptAllocations: [
        receipt("loss-rent", 100),
        receipt("blocked-rent", 100),
        receipt("healthy-b-rent", 100),
        receipt("healthy-a-rent", 100),
      ],
      statementBlockers: [{ blocker_count: 2, property_id: "blocked-property" }],
    });

    expect(
      buildOverviewPropertyPerformance(input).rows.map((row) => row.propertyId),
    ).toEqual([
      "loss-property",
      "arrears-property",
      "blocked-property",
      "healthy-a",
      "healthy-b",
    ]);
    expect(
      buildOverviewPropertyPerformance(input, "negative").rows.map(
        (row) => row.propertyId,
      ),
    ).toEqual(["loss-property"]);
    expect(
      buildOverviewPropertyPerformance(input, "arrears").rows.map(
        (row) => row.propertyId,
      ),
    ).toEqual(["arrears-property"]);
    expect(
      buildOverviewPropertyPerformance(input, "bills").rows.map(
        (row) => row.propertyId,
      ),
    ).toEqual(["blocked-property"]);
    expect(
      buildOverviewPropertyPerformance(input, "statement-blocked").rows.map(
        (row) => row.propertyId,
      ),
    ).toEqual(["blocked-property"]);
  });

  it("builds portfolio totals and statement readiness before row filtering", () => {
    const input = fixture({
      incomeItems: [
        income("one", 100, "rent", "property-1"),
        income("two", 300, "rent", "property-2"),
        income("other", 100, "late_fee", "property-2"),
      ],
      properties: [
        { code: "P1", id: "property-1", name: "One" },
        { code: "P2", id: "property-2", name: "Two" },
      ],
      receiptAllocations: [
        receipt("one", 50),
        receipt("two", 300),
        receipt("other", 100),
      ],
      statementBlockers: [{ blocker_count: 1, property_id: "property-1" }],
    });

    const result = buildOverviewPropertyPerformance(input, "arrears");

    expect(result.rows.map((row) => row.propertyId)).toEqual(["property-1"]);
    expect(result.summary).toMatchObject({
      arrearsAmount: 50,
      cashIncomeAmount: 450,
      collectionRate: 88,
      statementReadiness: { blockedCount: 1, readyCount: 1, totalCount: 2 },
    });
  });
});

function fixture(
  overrides: Partial<OverviewPropertyPerformanceInput> = {},
): OverviewPropertyPerformanceInput {
  return {
    currency: "USD",
    depositEvents: [],
    expenseItems: [],
    incomeItems: [],
    monthScope: { before: "2026-08-01", from: "2026-07-01" },
    openBills: [],
    paymentAllocations: [],
    properties: [{ code: "P1", id: propertyId, name: "Property One" }],
    receiptAllocations: [],
    statementBlockers: [],
    units: [{ id: "unit-1", property_id: propertyId }],
    ...overrides,
  };
}

function income(
  id: string,
  amountDue: number,
  incomeType = "rent",
  targetPropertyId = propertyId,
  dueDate = "2026-07-15",
) {
  return {
    amount_due: amountDue,
    due_date: dueDate,
    id,
    income_type: incomeType,
    property_id: targetPropertyId,
  };
}

function receipt(
  incomeItemId: string,
  amount: number,
  isReversal = false,
  receivedDate = "2026-07-20",
) {
  return {
    allocation_id: `allocation-${incomeItemId}-${receivedDate}-${isReversal}`,
    amount,
    income_item_id: incomeItemId,
    receipt_id: `receipt-${incomeItemId}-${receivedDate}-${isReversal}`,
    received_date: receivedDate,
    reversal_of_id: isReversal ? `original-${incomeItemId}` : null,
  };
}

function expense(
  id: string,
  economicScope = "property_expense",
  targetPropertyId = propertyId,
) {
  return {
    economic_scope: economicScope,
    expense_type: id,
    id,
    property_id: targetPropertyId,
  };
}

function payment(
  expenseItemId: string,
  amount: number,
  isReversal = false,
  paidDate = "2026-07-21",
) {
  return {
    allocation_id: `allocation-${expenseItemId}-${paidDate}-${isReversal}`,
    amount,
    expense_item_id: expenseItemId,
    paid_date: paidDate,
    payment_id: `payment-${expenseItemId}-${paidDate}-${isReversal}`,
    reversal_of_id: isReversal ? `original-${expenseItemId}` : null,
  };
}

function depositEvent(
  amount: number,
  eventType: OverviewPropertyPerformanceInput["depositEvents"][number]["event_type"] =
    "received",
  reversedEventType: "applied" | "received" | "refunded" | "retained" | null = null,
  eventDate = "2026-07-10",
): OverviewPropertyPerformanceInput["depositEvents"][number] {
  if (eventType === "reversed") {
    if (!reversedEventType) {
      throw new Error("Reversed test deposits require an original event type");
    }

    return {
      amount,
      event_date: eventDate,
      event_type: "reversed",
      id: `deposit-${eventType}-${reversedEventType}-${amount}-${eventDate}`,
      property_id: propertyId,
      reversed_event_type: reversedEventType,
    };
  }

  return {
    amount,
    event_date: eventDate,
    event_type: eventType,
    id: `deposit-${eventType}-${amount}-${eventDate}`,
    property_id: propertyId,
    reversed_event_type: null,
  };
}
