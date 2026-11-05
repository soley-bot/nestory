import { describe, expect, it } from "vitest";
import { parseOverviewLedgerSummary } from "./overview-ledger-summary";

describe("overview ledger aggregate contract", () => {
  const summary = {
    ledger_entry_count: 21_005,
    large_recent_expense_count: 2,
    months: [{ amount: -10.05, currency: "USD", direction: "income", transaction_date: "2026-10-01" }],
  };

  it("retains exact counts and negative reversal totals", () => {
    expect(parseOverviewLedgerSummary(summary)).toEqual(summary);
  });

  it.each([
    null,
    { ...summary, ledger_entry_count: null },
    { ...summary, ledger_entry_count: Number.MAX_SAFE_INTEGER + 1 },
    { ...summary, large_recent_expense_count: -1 },
    { ...summary, months: null },
    { ...summary, months: [{ ...summary.months[0], amount: "10.05" }] },
    { ...summary, months: [{ ...summary.months[0], amount: Infinity }] },
    { ...summary, months: [{ ...summary.months[0], currency: "KHR" }] },
    { ...summary, months: [{ ...summary.months[0], direction: "unknown" }] },
    { ...summary, months: [{ ...summary.months[0], transaction_date: "2026-13-01" }] },
  ])("rejects missing or invalid totals without displaying a partial summary: %j", (value) => {
    expect(() => parseOverviewLedgerSummary(value)).toThrow("complete exact totals are missing or invalid");
  });
});
