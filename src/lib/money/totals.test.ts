import { describe, expect, it } from "vitest";
import {
  formatMoneyTotals,
  formatMoneyTotalsDisplay,
} from "@/lib/money/totals";

describe("formatMoneyTotals", () => {
  it("adds income and subtracts expenses by currency", () => {
    const value = formatMoneyTotals([
      { amount: 1200, currency: "USD", direction: "income" },
      { amount: 250, currency: "USD", direction: "expense" },
      { amount: 400000, currency: "KHR", direction: "income" },
    ]);

    expect(value.replace(/\s/g, " ")).toBe("USD 950.00 / KHR 400,000");
  });

  it("returns zero in the fallback currency when no totals exist", () => {
    expect(formatMoneyTotals([])).toBe("USD 0.00");
  });

  it("converts totals into the preferred display currency", () => {
    expect(
      formatMoneyTotalsDisplay(
        [
          { amount: 1200, currency: "USD", direction: "income" },
          { amount: 250, currency: "USD", direction: "expense" },
          { amount: 400000, currency: "KHR", direction: "income" },
        ],
        { khrPerUsd: 4000, preferredCurrency: "KHR" },
      ),
    ).toEqual({
      primary: "KHR 4,200,000",
      primaryCurrency: "KHR",
      secondary: "USD 1,050.00",
      secondaryCurrency: "USD",
    });
  });
});
