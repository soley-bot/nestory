import { describe, expect, it } from "vitest";

import {
  buildOverviewPropertyPerformance,
  type OverviewPropertyPerformanceInput,
} from "@/features/overview/property-performance";
import type { PropertyCashInput } from "@/features/finance/property-cash";

const propertyId = "property-1";

describe("buildOverviewPropertyPerformance", () => {
  it("keeps deposits, owner contributions, and owner payouts out of Overview net cash", () => {
    const result = buildOverviewPropertyPerformance(
      fixture({
        depositEvents: [depositEvent(1_400)],
        expenseItems: [
          expense("cleaning"),
          expense("building"),
          expense("repairs"),
          expense("owner_payout"),
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
          payment("owner_payout", 900),
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
      depositEventId: "malformed-reversal",
      eventDate: "2026-07-10",
      eventType: "reversed",
      propertyId,
      reversedEventType: null,
    } as unknown as PropertyCashInput["depositEvents"][number];

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
      statementReadiness: {
        properties: [
          {
            blocker_count: 2,
            property_id: "blocked-property",
            ready_statement_count: 0,
          },
        ],
        summary: {
          blockedPropertyCount: 1,
          readyPropertyCount: 4,
          readyStatementCount: 4,
          totalPropertyCount: 5,
        },
      },
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
      statementReadiness: {
        properties: [
          {
            blocker_count: 1,
            property_id: "property-1",
            ready_statement_count: 0,
          },
          {
            blocker_count: 0,
            property_id: "property-2",
            ready_statement_count: 1,
          },
        ],
        summary: {
          blockedPropertyCount: 1,
          readyPropertyCount: 1,
          readyStatementCount: 1,
          totalPropertyCount: 2,
        },
      },
    });

    const result = buildOverviewPropertyPerformance(input, "arrears");

    expect(result.rows.map((row) => row.propertyId)).toEqual(["property-1"]);
    expect(result.summary).toMatchObject({
      arrearsAmount: 50,
      cashIncomeAmount: 450,
      collectionRate: 88,
      statementReadiness: {
        blockedPropertyCount: 1,
        readyPropertyCount: 1,
        readyStatementCount: 1,
        totalPropertyCount: 2,
      },
    });
  });
});

type FixtureOverrides = Partial<Omit<OverviewPropertyPerformanceInput, "cashInput">> &
  Partial<PropertyCashInput>;

function fixture(overrides: FixtureOverrides = {}): OverviewPropertyPerformanceInput {
  const {
    currency = "USD",
    openBills = [],
    properties = [{ code: "P1", id: propertyId, name: "Property One" }],
    statementReadiness = {
      properties: [
        {
          blocker_count: 0,
          property_id: propertyId,
          ready_statement_count: 1,
        },
      ],
      summary: {
        blockedPropertyCount: 0,
        readyPropertyCount: 1,
        readyStatementCount: 1,
        totalPropertyCount: 1,
      },
    },
    units = [{ id: "unit-1", property_id: propertyId }],
    ...cashOverrides
  } = overrides;
  return {
    cashInput: {
      depositEvents: cashOverrides.depositEvents ?? [],
      expenseItems: cashOverrides.expenseItems ?? [],
      incomeItems: cashOverrides.incomeItems ?? [],
      monthScope: cashOverrides.monthScope ?? {
        before: "2026-08-01",
        from: "2026-07-01",
      },
      paymentAllocations: cashOverrides.paymentAllocations ?? [],
      propertyIds:
        cashOverrides.propertyIds ?? properties.map((property) => property.id),
      receiptAllocations: cashOverrides.receiptAllocations ?? [],
    },
    currency,
    openBills,
    properties,
    statementReadiness,
    units,
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
    amountDue,
    dueDate,
    id,
    incomeType,
    propertyId: targetPropertyId,
  };
}

function receipt(
  incomeItemId: string,
  amount: number,
  isReversal = false,
  receivedDate = "2026-07-20",
) {
  return {
    allocationId: `allocation-${incomeItemId}-${receivedDate}-${isReversal}`,
    amount,
    incomeItemId,
    receiptId: `receipt-${incomeItemId}-${receivedDate}-${isReversal}`,
    receivedDate,
    reversalOfId: isReversal ? `original-${incomeItemId}` : null,
  };
}

function expense(
  id: string,
  economicScope = "property_expense",
  targetPropertyId = propertyId,
) {
  return {
    economicScope,
    expenseType: id,
    id,
    propertyId: targetPropertyId,
  };
}

function payment(
  expenseItemId: string,
  amount: number,
  isReversal = false,
  paidDate = "2026-07-21",
) {
  return {
    allocationId: `allocation-${expenseItemId}-${paidDate}-${isReversal}`,
    amount,
    expenseItemId,
    paidDate,
    paymentId: `payment-${expenseItemId}-${paidDate}-${isReversal}`,
    reversalOfId: isReversal ? `original-${expenseItemId}` : null,
  };
}

function depositEvent(
  amount: number,
  eventType: PropertyCashInput["depositEvents"][number]["eventType"] =
    "received",
  reversedEventType: "applied" | "received" | "refunded" | "retained" | null = null,
  eventDate = "2026-07-10",
): PropertyCashInput["depositEvents"][number] {
  if (eventType === "reversed") {
    if (!reversedEventType) {
      throw new Error("Reversed test deposits require an original event type");
    }

    return {
      amount,
      depositEventId: `deposit-${eventType}-${reversedEventType}-${amount}-${eventDate}`,
      eventDate,
      eventType: "reversed",
      propertyId,
      reversedEventType,
    };
  }

  return {
    amount,
    depositEventId: `deposit-${eventType}-${amount}-${eventDate}`,
    eventDate,
    eventType,
    propertyId,
    reversedEventType: null,
  };
}
