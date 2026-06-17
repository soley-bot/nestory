import { describe, expect, it } from "vitest";
import { buildLedgerSnapshot } from "@/features/ledger/data/ledger-summary";

describe("buildLedgerSnapshot", () => {
  it("formats income, expense, and net totals by currency", () => {
    const snapshot = buildLedgerSnapshot([
      { amount: 1000, currency: "USD", direction: "income" },
      { amount: 150, currency: "USD", direction: "expense" },
      { amount: 400000, currency: "KHR", direction: "income" },
    ]);

    expect(snapshot.totalIncome).toMatchObject({
      primary: "USD 1,097.56",
      secondary: "KHR 4,500,000",
    });
    expect(snapshot.totalExpense).toMatchObject({
      primary: "USD 150.00",
      secondary: "KHR 615,000",
    });
    expect(snapshot.netIncome).toMatchObject({
      primary: "USD 947.56",
      secondary: "KHR 3,885,000",
    });
    expect(snapshot.entryCount).toBe("3");
    expect(snapshot.lockedPeriodCount).toBe("0");
  });
});
