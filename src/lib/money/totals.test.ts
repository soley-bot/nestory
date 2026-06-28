import { describe, expect, it } from "vitest";
import {
  formatMoneyTotals,
  formatMoneyTotalsDisplay,
} from "@/lib/money/totals";

describe("formatMoneyTotals", () => {
  it("adds income and subtracts expenses in USD", () => {
    const value = formatMoneyTotals([
      { amount: 1200, currency: "USD", direction: "income" },
      { amount: 250, currency: "USD", direction: "expense" },
    ]);

    expect(value.replace(/\s/g, " ")).toBe("USD 950.00");
  });

  it("returns zero in the fallback currency when no totals exist", () => {
    expect(formatMoneyTotals([])).toBe("USD 0.00");
  });

  it("returns a primary display total", () => {
    expect(
      formatMoneyTotalsDisplay([
        { amount: 1200, currency: "USD", direction: "income" },
        { amount: 250, currency: "USD", direction: "expense" },
      ]),
    ).toEqual({
      primary: "USD 950.00",
    });
  });
});
