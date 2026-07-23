import { describe, expect, it } from "vitest";
import { calculatePettyCashRegister } from "@/features/petty-cash/register-facts";

const period = {
  advanceAmount: 290,
  openingBalanceAmount: 10,
};

describe("calculatePettyCashRegister", () => {
  it("keeps a period advance separate until a live advance row exists", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [],
      period,
    });

    expect(register.effectiveOpeningAmount).toBe(300);
    expect(register.cashInAmount).toBe(0);
    expect(register.closingBalanceAmount).toBe(300);
  });

  it("uses an explicit advance row instead of the matching legacy period advance", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          entryKind: "advance",
          id: "itemized-period-advance",
          inAmount: 290,
          outAmount: 0,
        }),
      ],
      period,
    });

    expect(register.effectiveOpeningAmount).toBe(10);
    expect(register.cashInAmount).toBe(290);
    expect(register.closingBalanceAmount).toBe(300);
  });

  it("keeps opening cash when a later advance is added to a forward-created period", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          createdAt: "2026-07-01T08:00:00.000Z",
          id: "expense-before-advance",
          inAmount: 0,
          outAmount: 75,
        }),
        makeEntry({
          createdAt: "2026-07-02T08:00:00.000Z",
          entryKind: "advance",
          id: "later-advance",
          inAmount: 100,
          outAmount: 0,
        }),
      ],
      period: { advanceAmount: 0, openingBalanceAmount: 500 },
    });

    expect(register.effectiveOpeningAmount).toBe(500);
    expect(register.cashInAmount).toBe(100);
    expect(register.cashOutAmount).toBe(75);
    expect(register.entries.map((entry) => entry.balanceAfter)).toEqual([
      425,
      525,
    ]);
    expect(register.closingBalanceAmount).toBe(525);
  });

  it("uses deterministic date, creation, and id ordering for running balances", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          createdAt: "2026-07-02T08:00:00.000Z",
          id: "entry-b",
          inAmount: 0,
          invoiceDate: "2026-07-02",
          outAmount: 20,
        }),
        makeEntry({
          createdAt: "2026-07-01T08:00:00.000Z",
          id: "entry-c",
          inAmount: 30,
          invoiceDate: "2026-07-01",
          outAmount: 0,
        }),
        makeEntry({
          createdAt: "2026-07-02T08:00:00.000Z",
          id: "entry-a",
          inAmount: 0,
          invoiceDate: "2026-07-02",
          outAmount: 10,
        }),
      ],
      period: { advanceAmount: 0, openingBalanceAmount: 100 },
    });

    expect(register.entries.map((entry) => entry.id)).toEqual([
      "entry-c",
      "entry-a",
      "entry-b",
    ]);
    expect(register.entries.map((entry) => entry.balanceAfter)).toEqual([
      130,
      120,
      100,
    ]);
  });

  it("retains void rows visibly while giving them zero cash impact", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          id: "void-expense",
          inAmount: 0,
          outAmount: 50,
          status: "void",
        }),
        makeEntry({
          entryKind: "advance",
          id: "void-advance",
          inAmount: 290,
          outAmount: 0,
          status: "void",
        }),
      ],
      period,
    });

    expect(register.effectiveOpeningAmount).toBe(300);
    expect(register.cashInAmount).toBe(0);
    expect(register.cashOutAmount).toBe(0);
    expect(register.closingBalanceAmount).toBe(300);
    expect(register.voidCount).toBe(2);
    expect(register.entries.map((entry) => entry.balanceAfter)).toEqual([
      300,
      300,
    ]);
  });

  it("counts posted cash as physical cash out without making it ready again", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          id: "draft",
          outAmount: 10,
          receiptReference: null,
          status: "draft",
        }),
        makeEntry({
          id: "cleared",
          outAmount: 20,
          receiptReference: "R-20",
          status: "cleared",
        }),
        makeEntry({
          id: "posted",
          outAmount: 30,
          receiptReference: "R-30",
          status: "posted",
        }),
      ],
      period: { advanceAmount: 0, openingBalanceAmount: 100 },
    });

    expect(register.cashOutAmount).toBe(60);
    expect(register.postedCount).toBe(1);
    expect(register.readyToPostCount).toBe(2);
    expect(register.receiptMissingCount).toBe(1);
    expect(register.closingBalanceAmount).toBe(40);
  });

  it("keeps archived expenses visible without changing register facts", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          archivedAt: "2026-07-20T00:00:00.000Z",
          id: "archived-posted-expense",
          outAmount: 50,
          status: "posted",
        }),
      ],
      period,
    });

    expect(register.cashOutAmount).toBe(0);
    expect(register.closingBalanceAmount).toBe(300);
    expect(register.postedCount).toBe(0);
    expect(register.readyToPostCount).toBe(0);
    expect(register.receiptMissingCount).toBe(0);
    expect(register.voidCount).toBe(0);
    expect(register.entries[0]).toMatchObject({
      balanceAfter: 300,
      effectiveOutAmount: 0,
    });
  });

  it("does not let an archived advance suppress the period advance", () => {
    const register = calculatePettyCashRegister({
      currency: "USD",
      entries: [
        makeEntry({
          archivedAt: "2026-07-20T00:00:00.000Z",
          entryKind: "advance",
          id: "archived-advance",
          inAmount: 290,
          outAmount: 0,
          status: "posted",
        }),
      ],
      period,
    });

    expect(register.effectiveOpeningAmount).toBe(300);
    expect(register.cashInAmount).toBe(0);
    expect(register.closingBalanceAmount).toBe(300);
  });
});

function makeEntry(
  overrides: Partial<{
    archivedAt: string | null;
    createdAt: string;
    entryKind: "advance" | "cash_in" | "expense";
    id: string;
    inAmount: number;
    invoiceDate: string;
    outAmount: number;
    receiptReference: string | null;
    status: "cleared" | "draft" | "posted" | "void";
  }> = {},
) {
  return {
    createdAt: "2026-07-01T00:00:00.000Z",
    entryKind: "expense" as const,
    id: "entry-1",
    inAmount: 0,
    invoiceDate: "2026-07-01",
    outAmount: 0,
    receiptReference: null,
    status: "cleared" as const,
    ...overrides,
  };
}
