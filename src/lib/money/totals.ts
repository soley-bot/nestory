import {
  formatMoney,
  type CurrencyCode,
  type MoneyDisplayValue,
} from "@/lib/money/format";

export type MoneyTotalInput = {
  amount: number | null;
  currency: CurrencyCode | null;
  direction?: string | null;
};

export function formatMoneyTotals(
  entries: MoneyTotalInput[],
  fallbackCurrency: CurrencyCode = "USD",
) {
  let total = 0;

  for (const entry of entries) {
    if (entry.amount === null) {
      continue;
    }

    const sign = entry.direction === "expense" ? -1 : 1;
    total += Number(entry.amount) * sign;
  }

  if (total === 0) {
    return formatMoney(0, fallbackCurrency);
  }

  return formatMoney(total, fallbackCurrency);
}

export function formatMoneyTotalsDisplay(
  entries: MoneyTotalInput[],
): MoneyDisplayValue {
  let total = 0;

  for (const entry of entries) {
    if (entry.amount === null) {
      continue;
    }

    const sign = entry.direction === "expense" ? -1 : 1;
    total += Number(entry.amount) * sign;
  }

  return {
    primary: formatMoney(total),
  };
}
