import { formatMoneyTotalsDisplay } from "@/lib/money/totals";
import type {
  CurrencyCode,
  CurrencyDisplaySettings,
} from "@/lib/money/format";
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
    currencySettings?: Partial<CurrencyDisplaySettings> | null;
    entryCount?: number;
  } = {},
): LedgerSnapshot {
  return {
    entryCount: String(options.entryCount ?? entries.length),
    lockedPeriodCount: "0",
    netIncome: formatMoneyTotalsDisplay(entries, options.currencySettings),
    totalExpense: formatDirectionTotal(
      entries,
      "expense",
      options.currencySettings,
    ),
    totalIncome: formatDirectionTotal(
      entries,
      "income",
      options.currencySettings,
    ),
  };
}

function formatDirectionTotal(
  entries: LedgerSummaryEntry[],
  direction: LedgerDirection,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  return formatMoneyTotalsDisplay(
    entries
      .filter((entry) => entry.direction === direction)
      .map((entry) => ({
        amount: entry.amount,
        currency: entry.currency,
      })),
    currencySettings,
  );
}
