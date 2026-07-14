import { describe, expect, it } from "vitest";

import {
  buildPropertyCash,
  type PropertyCashInput,
} from "@/features/finance/property-cash";

const propertyId = "property-1";

describe("buildPropertyCash", () => {
  it("recognizes a full rent receipt on the receipt date with traceable source IDs", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("rent-1", 1_400)],
        receiptAllocations: [receiptAllocation("rent-1", 1_400)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      arrearsCents: 0,
      operatingCashReceivedCents: 140_000,
      rentDueCents: 140_000,
      rentReceivedCents: 140_000,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual({
      allocationId: "receipt-allocation-rent-1",
      classification: "operating_receipt",
      depositEventId: null,
      eventDate: "2026-07-20",
      expenseItemId: null,
      incomeItemId: "rent-1",
      paymentId: null,
      propertyId,
      receiptId: "receipt-rent-1",
      signedAmountCents: 140_000,
    });
  });

  it("keeps partial rent receipt cash, collection, and arrears in cents", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("rent-1", 1_000)],
        receiptAllocations: [receiptAllocation("rent-1", 400)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      arrearsCents: 60_000,
      operatingCashReceivedCents: 40_000,
      rentDueCents: 100_000,
      rentReceivedCents: 40_000,
    });
  });

  it("recognizes a receipt in its settlement month instead of the rent charge month", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("june-rent", 100, "rent", "2026-06-15")],
        receiptAllocations: [receiptAllocation("june-rent", 100)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      arrearsCents: 0,
      operatingCashReceivedCents: 10_000,
      rentDueCents: 0,
      rentReceivedCents: 0,
    });
  });

  it("does not let a future receipt settle an earlier period obligation", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("july-rent", 200)],
        receiptAllocations: [
          receiptAllocation("july-rent", 200, "2026-08-03"),
        ],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      arrearsCents: 20_000,
      operatingCashReceivedCents: 0,
      rentDueCents: 20_000,
      rentReceivedCents: 0,
    });
  });

  it("retains prior receipt IDs when they reduce current obligation arrears", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("july-rent", 100)],
        receiptAllocations: [
          receiptAllocation("july-rent", 40, "2026-06-30", null, "prepaid"),
        ],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      arrearsCents: 6_000,
      operatingCashReceivedCents: 0,
      rentReceivedCents: 4_000,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        allocationId: "receipt-allocation-prepaid",
        classification: "operating_receipt",
        eventDate: "2026-06-30",
        incomeItemId: "july-rent",
        receiptId: "receipt-prepaid",
        signedAmountCents: 4_000,
      }),
    );
  });

  it("recognizes a receipt reversal as negative cash in the reversal month", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("rent-1", 100)],
        receiptAllocations: [
          receiptAllocation(
            "rent-1",
            100,
            "2026-06-20",
            null,
            "original",
          ),
          receiptAllocation(
            "rent-1",
            100,
            "2026-07-20",
            "receipt-original",
            "reversal",
          ),
        ],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      arrearsCents: 10_000,
      operatingCashReceivedCents: -10_000,
      rentReceivedCents: 0,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        allocationId: "receipt-allocation-reversal",
        classification: "operating_receipt",
        receiptId: "receipt-reversal",
        signedAmountCents: -10_000,
      }),
    );
  });

  it("exposes an earned but unpaid management fee as outstanding", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("fee-1", 100, "management_fee")],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      managementFeesEarnedCents: 10_000,
      managementFeesOutstandingCents: 10_000,
      managementFeesReceivedCents: 0,
      netOwnerCashMovementCents: 0,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        classification: "management_fee_earned",
        eventDate: "2026-07-15",
        incomeItemId: "fee-1",
        signedAmountCents: 10_000,
      }),
    );
  });

  it("separates received management fees and reduces owner cash", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("fee-1", 100, "management_fee")],
        receiptAllocations: [receiptAllocation("fee-1", 40)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      managementFeesEarnedCents: 10_000,
      managementFeesOutstandingCents: 6_000,
      managementFeesReceivedCents: 4_000,
      netOwnerCashMovementCents: -4_000,
      operatingCashReceivedCents: 0,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        classification: "management_fee_received",
        incomeItemId: "fee-1",
        signedAmountCents: 4_000,
      }),
    );
  });

  it("retains prior receipt IDs when they reduce an outstanding management fee", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("fee-1", 100, "management_fee")],
        receiptAllocations: [
          receiptAllocation("fee-1", 40, "2026-06-30", null, "prepaid-fee"),
        ],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      managementFeesEarnedCents: 10_000,
      managementFeesOutstandingCents: 6_000,
      managementFeesReceivedCents: 0,
      netOwnerCashMovementCents: 0,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        allocationId: "receipt-allocation-prepaid-fee",
        classification: "management_fee_received",
        eventDate: "2026-06-30",
        incomeItemId: "fee-1",
        receiptId: "receipt-prepaid-fee",
        signedAmountCents: 4_000,
      }),
    );
  });

  it("keeps owner contributions separate from operating income", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("contribution-1", 250, "owner_contribution")],
        receiptAllocations: [receiptAllocation("contribution-1", 250)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      netOwnerCashMovementCents: 25_000,
      operatingCashReceivedCents: 0,
      ownerContributionCents: 25_000,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        classification: "owner_contribution",
        incomeItemId: "contribution-1",
        signedAmountCents: 25_000,
      }),
    );
  });

  it("recognizes a full property payment on the payment date with traceable IDs", () => {
    const result = buildPropertyCash(
      fixture({
        expenseItems: [expenseItem("bill-1", 200)],
        paymentAllocations: [paymentAllocation("bill-1", 200)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      netOwnerCashMovementCents: -20_000,
      propertyExpensesPaidCents: 20_000,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual({
      allocationId: "payment-allocation-bill-1",
      classification: "property_expense",
      depositEventId: null,
      eventDate: "2026-07-21",
      expenseItemId: "bill-1",
      incomeItemId: null,
      paymentId: "payment-bill-1",
      propertyId,
      receiptId: null,
      signedAmountCents: 20_000,
    });
  });

  it("recognizes a partial property payment without using the bill amount", () => {
    const result = buildPropertyCash(
      fixture({
        expenseItems: [expenseItem("bill-1", 200)],
        paymentAllocations: [paymentAllocation("bill-1", 50)],
      }),
    );

    expect(result.properties[0]?.propertyExpensesPaidCents).toBe(5_000);
  });

  it("recognizes a bill in the payment month even when invoiced earlier", () => {
    const result = buildPropertyCash(
      fixture({
        expenseItems: [
          expenseItem("june-bill", 200, {
            invoiceDate: "2026-06-15",
          }),
        ],
        paymentAllocations: [paymentAllocation("june-bill", 75)],
      }),
    );

    expect(result.properties[0]?.propertyExpensesPaidCents).toBe(7_500);
  });

  it("recognizes a payment reversal as negative expense cash in the reversal month", () => {
    const result = buildPropertyCash(
      fixture({
        expenseItems: [expenseItem("bill-1", 100)],
        paymentAllocations: [
          paymentAllocation("bill-1", 100, "2026-06-21", null, "original"),
          paymentAllocation(
            "bill-1",
            100,
            "2026-07-21",
            "payment-original",
            "reversal",
          ),
        ],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      netOwnerCashMovementCents: 10_000,
      propertyExpensesPaidCents: -10_000,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        allocationId: "payment-allocation-reversal",
        paymentId: "payment-reversal",
        signedAmountCents: -10_000,
      }),
    );
  });

  it("keeps owner payouts separate from normal property expenses", () => {
    const result = buildPropertyCash(
      fixture({
        expenseItems: [
          expenseItem("payout-1", 80, { expenseType: "owner_payout" }),
        ],
        paymentAllocations: [paymentAllocation("payout-1", 80)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      netOwnerCashMovementCents: -8_000,
      ownerPayoutCents: 8_000,
      propertyExpensesPaidCents: 0,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        classification: "owner_payout",
        expenseItemId: "payout-1",
        signedAmountCents: 8_000,
      }),
    );
  });

  it.each(["company_cost", "company_advance"])(
    "excludes %s payments from property cash",
    (economicScope) => {
      const result = buildPropertyCash(
        fixture({
          expenseItems: [
            expenseItem("company-bill", 90, { economicScope }),
          ],
          paymentAllocations: [paymentAllocation("company-bill", 90)],
        }),
      );

      expect(result.properties[0]).toMatchObject({
        netOwnerCashMovementCents: 0,
        ownerPayoutCents: 0,
        propertyExpensesPaidCents: 0,
      });
      expect(result.properties[0]?.sourceLines).toEqual([]);
    },
  );

  it("tracks a deposit receipt as held cash without treating its finance receipt as income", () => {
    const result = buildPropertyCash(
      fixture({
        depositEvents: [depositEvent("deposit-received", 500, "received")],
        incomeItems: [incomeItem("deposit-obligation", 500, "security_deposit")],
        receiptAllocations: [receiptAllocation("deposit-obligation", 500)],
      }),
    );

    expect(result.properties[0]).toMatchObject({
      operatingCashReceivedCents: 0,
      securityDepositHeldCents: 50_000,
    });
    expect(result.properties[0]?.sourceLines).toContainEqual({
      allocationId: null,
      classification: "security_deposit",
      depositEventId: "deposit-received",
      eventDate: "2026-07-10",
      expenseItemId: null,
      incomeItemId: null,
      paymentId: null,
      propertyId,
      receiptId: null,
      signedAmountCents: 50_000,
    });
  });

  it("subtracts a deposit refund from the period-end held balance", () => {
    const result = buildPropertyCash(
      fixture({
        depositEvents: [
          depositEvent("deposit-received", 500, "received", "2026-06-10"),
          depositEvent("deposit-refunded", 125, "refunded"),
        ],
      }),
    );

    expect(result.properties[0]?.securityDepositHeldCents).toBe(37_500);
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        depositEventId: "deposit-refunded",
        signedAmountCents: -12_500,
      }),
    );
  });

  it("reverses the original deposit direction in the reversal period", () => {
    const result = buildPropertyCash(
      fixture({
        depositEvents: [
          depositEvent("deposit-received", 500, "received", "2026-06-10"),
          depositEvent(
            "deposit-reversal",
            500,
            "reversed",
            "2026-07-10",
            "received",
          ),
        ],
      }),
    );

    expect(result.properties[0]?.securityDepositHeldCents).toBe(0);
    expect(result.properties[0]?.sourceLines).toContainEqual(
      expect.objectContaining({
        depositEventId: "deposit-reversal",
        eventDate: "2026-07-10",
        signedAmountCents: -50_000,
      }),
    );
  });

  it("rounds each decimal source amount to cents before accumulation", () => {
    const result = buildPropertyCash(
      fixture({
        incomeItems: [incomeItem("late-fee", 1, "late_fee")],
        receiptAllocations: [
          receiptAllocation("late-fee", 0.105, "2026-07-10", null, "one"),
          receiptAllocation("late-fee", 0.105, "2026-07-11", null, "two"),
        ],
      }),
    );

    expect(result.properties[0]?.operatingCashReceivedCents).toBe(22);
  });

  it("uses organization-independent pure inputs without mutating them", () => {
    const input = fixture({
      incomeItems: [incomeItem("rent-1", 100)],
      receiptAllocations: [receiptAllocation("rent-1", 100)],
    });
    const snapshot = structuredClone(input);

    const result = buildPropertyCash(input);

    expect(input).toEqual(snapshot);
    expect(input).not.toHaveProperty("organizationId");
    expect(result).not.toHaveProperty("organizationId");
  });

  it("returns identical property facts regardless of input row order", () => {
    const input = fixture({
      depositEvents: [
        depositEvent("deposit-two", 50, "received", "2026-07-02", null, "property-2"),
        depositEvent("deposit-one", 25, "received", "2026-07-01"),
      ],
      incomeItems: [
        incomeItem("rent-2", 200, "rent", "2026-07-15", "property-2"),
        incomeItem("rent-1", 100),
      ],
      propertyIds: ["property-2", propertyId],
      receiptAllocations: [
        receiptAllocation("rent-2", 200),
        receiptAllocation("rent-1", 100),
      ],
    });
    const reversedInput = {
      ...input,
      depositEvents: input.depositEvents.toReversed(),
      incomeItems: input.incomeItems.toReversed(),
      propertyIds: input.propertyIds.toReversed(),
      receiptAllocations: input.receiptAllocations.toReversed(),
    };

    expect(buildPropertyCash(reversedInput)).toEqual(buildPropertyCash(input));
  });
});

function fixture(
  overrides: Partial<PropertyCashInput> = {},
): PropertyCashInput {
  return {
    depositEvents: [],
    expenseItems: [],
    incomeItems: [],
    monthScope: { before: "2026-08-01", from: "2026-07-01" },
    paymentAllocations: [],
    propertyIds: [propertyId],
    receiptAllocations: [],
    ...overrides,
  };
}

function incomeItem(
  id: string,
  amountDue: number,
  incomeType = "rent",
  dueDate = "2026-07-15",
  targetPropertyId = propertyId,
) {
  return {
    amountDue,
    dueDate,
    id,
    incomeType,
    propertyId: targetPropertyId,
  };
}

function expenseItem(
  id: string,
  amount: number,
  overrides: Partial<{
    economicScope: string;
    expenseType: string;
    invoiceDate: string;
  }> = {},
) {
  return {
    amount,
    economicScope: "property_expense",
    expenseType: "maintenance",
    id,
    invoiceDate: "2026-07-10",
    propertyId,
    ...overrides,
  };
}

function receiptAllocation(
  incomeItemId: string,
  amount: number,
  receivedDate = "2026-07-20",
  reversalOfId: string | null = null,
  sourceKey = incomeItemId,
) {
  return {
    allocationId: `receipt-allocation-${sourceKey}`,
    amount,
    incomeItemId,
    receiptId: `receipt-${sourceKey}`,
    receivedDate,
    reversalOfId,
  };
}

function paymentAllocation(
  expenseItemId: string,
  amount: number,
  paidDate = "2026-07-21",
  reversalOfId: string | null = null,
  sourceKey = expenseItemId,
) {
  return {
    allocationId: `payment-allocation-${sourceKey}`,
    amount,
    expenseItemId,
    paidDate,
    paymentId: `payment-${sourceKey}`,
    reversalOfId,
  };
}

function depositEvent(
  depositEventId: string,
  amount: number,
  eventType: "applied" | "received" | "refunded" | "retained" | "reversed",
  eventDate = "2026-07-10",
  reversedEventType: "applied" | "received" | "refunded" | "retained" | null = null,
  targetPropertyId = propertyId,
) {
  return {
    amount,
    depositEventId,
    eventDate,
    eventType,
    propertyId: targetPropertyId,
    reversedEventType,
  };
}
