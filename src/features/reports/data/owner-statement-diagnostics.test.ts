import { describe, expect, it } from "vitest";
import {
  buildOwnerStatementCashDiagnostics,
  ownerStatementCashDiagnosticCopy,
} from "@/features/reports/data/owner-statement-diagnostics";

describe("Owner Statement cash diagnostics", () => {
  it.each([
    [0, "charged, but no cash was received"],
    [400, "partially received"],
    [1000, "full rent receipt is included"],
  ])("distinguishes a %i receipt without changing cash-basis totals", (received, copy) => {
    const diagnostics = buildOwnerStatementCashDiagnostics({
      depositEvents: [],
      expenseItems: [],
      incomeItems: [
        {
          amountDue: 1000,
          dueDate: "2026-07-01",
          id: "rent-1",
          incomeType: "rent",
          propertyId: "property-1",
        },
      ],
      monthScope: { before: "2026-08-01", from: "2026-07-01" },
      paymentAllocations: [],
      propertyIds: ["property-1"],
      receiptAllocations:
        received > 0
          ? [
              {
                allocationId: "allocation-1",
                amount: received,
                incomeItemId: "rent-1",
                receiptId: "receipt-1",
                receivedDate: "2026-07-10",
                reversalOfId: null,
              },
            ]
          : [],
    });

    expect(ownerStatementCashDiagnosticCopy(diagnostics[0])).toContain(copy);
    expect(diagnostics[0]).toMatchObject({
      currentPeriodRentCashCents: received * 100,
      rentArrearsCents: (1000 - received) * 100,
      rentDueCents: 100_000,
      rentReceivedCents: received * 100,
    });
  });
});
