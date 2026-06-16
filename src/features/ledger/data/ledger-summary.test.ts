import { describe, expect, it } from "vitest";
import { buildLedgerSnapshot } from "@/features/ledger/data/ledger-summary";

describe("buildLedgerSnapshot", () => {
  it("formats income, expense, and net totals by currency", () => {
    const snapshot = buildLedgerSnapshot([
      { amount: 1000, currency: "USD", direction: "income" },
      { amount: 150, currency: "USD", direction: "expense" },
      { amount: 400000, currency: "KHR", direction: "income" },
    ]);

    expect(normalizeSpaces(snapshot.totalIncome)).toBe("$1,000.00 / KHR 400,000");
    expect(snapshot.totalExpense).toBe("$150.00");
    expect(normalizeSpaces(snapshot.netIncome)).toBe("$850.00 / KHR 400,000");
    expect(snapshot.entryCount).toBe("3");
  });
});

function normalizeSpaces(value: string) {
  return value.replace(/\s/g, " ");
}
