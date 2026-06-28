import { formatMoneyTotalsDisplay } from "@/lib/money/totals";
import type { CurrencyCode } from "@/lib/money/format";
import type {
  LedgerDirection,
  LedgerSnapshot,
} from "@/features/ledger/ledger.types";

type LedgerSummaryEntry = {
  amount: number | null;
  currency: CurrencyCode | null;
  direction: LedgerDirection | string | null;
};

export function buildLedgerSnapshot(
  entries: LedgerSummaryEntry[],
  options: {
    entryCount?: number;
  } = {},
): LedgerSnapshot {
  return {
    entryCount: String(options.entryCount ?? entries.length),
    lockedPeriodCount: "0",
    netIncome: formatMoneyTotalsDisplay(entries),
    totalExpense: formatDirectionTotal(entries, "expense"),
    totalIncome: formatDirectionTotal(entries, "income"),
  };
}

function formatDirectionTotal(
  entries: LedgerSummaryEntry[],
  direction: LedgerDirection,
) {
  return formatMoneyTotalsDisplay(
    entries
      .filter((entry) => entry.direction === direction)
      .map((entry) => ({
        amount: entry.amount,
        currency: entry.currency,
      })),
  );
}
