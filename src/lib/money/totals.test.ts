import { describe, expect, it } from "vitest";
import { formatMoneyTotals } from "@/lib/money/totals";

describe("formatMoneyTotals", () => {
  it("adds income and subtracts expenses by currency", () => {
    const value = formatMoneyTotals([
      { amount: 1200, currency: "USD", direction: "income" },
      { amount: 250, currency: "USD", direction: "expense" },
      { amount: 400000, currency: "KHR", direction: "income" },
    ]);

    expect(value.replace(/\s/g, " ")).toBe("$950.00 / KHR 400,000");
  });

  it("returns zero in the fallback currency when no totals exist", () => {
    expect(formatMoneyTotals([])).toBe("$0.00");
  });
});
