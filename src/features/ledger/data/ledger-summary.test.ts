import { describe, expect, it } from "vitest";
import { buildLedgerSnapshot } from "@/features/ledger/data/ledger-summary";

describe("buildLedgerSnapshot", () => {
  it("formats income, expense, and net totals in USD", () => {
    const snapshot = buildLedgerSnapshot([
      { amount: 1000, currency: "USD", direction: "income" },
      { amount: 150, currency: "USD", direction: "expense" },
    ]);

    expect(snapshot.totalIncome).toMatchObject({
      primary: "USD 1,000.00",
    });
    expect(snapshot.totalExpense).toMatchObject({
      primary: "USD 150.00",
    });
    expect(snapshot.netIncome).toMatchObject({
      primary: "USD 850.00",
    });
    expect(snapshot.entryCount).toBe("2");
    expect(snapshot.lockedPeriodCount).toBe("0");
  });
});
