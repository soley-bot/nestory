import { describe, expect, it } from "vitest";
import { buildSummary } from "@/features/petty-cash/data/petty-cash";
import type {
  PettyCashEntry,
  PettyCashPeriod,
} from "@/features/petty-cash/petty-cash.types";

const period: PettyCashPeriod = {
  advanceAmount: 290,
  id: "period-1",
  openingBalanceAmount: 0,
  periodStart: "2026-07-01",
  status: "open",
};

describe("petty cash summary", () => {
  it("keeps the opening float separate from cash-in rows", () => {
    const summary = buildSummary(period, []);

    expect(summary.openingFloat.primary).toBe("USD 290.00");
    expect(summary.cashIn.primary).toBe("USD 0.00");
    expect(summary.balance.primary).toBe("USD 290.00");
  });

  it("uses an explicit advance row instead of duplicating opening float", () => {
    const summary = buildSummary(period, [
      {
        balanceAfter: 290,
        category: "Advance",
        createdAt: "2026-07-01T00:00:00.000Z",
        currency: "USD",
        description: "Opening advance",
        entryKind: "advance",
        id: "entry-1",
        inAmount: 290,
        invoiceDate: "2026-07-01",
        outAmount: 0,
        status: "cleared",
      } satisfies PettyCashEntry,
    ]);

    expect(summary.openingFloat.primary).toBe("USD 0.00");
    expect(summary.cashIn.primary).toBe("USD 290.00");
    expect(summary.balance.primary).toBe("USD 290.00");
  });
});
