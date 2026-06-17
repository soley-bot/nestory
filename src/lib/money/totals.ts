import {
  convertMoney,
  formatMoney,
  getSecondaryCurrency,
  normalizeCurrencyDisplaySettings,
  type CurrencyCode,
  type CurrencyDisplaySettings,
  type MoneyDisplayValue,
} from "@/lib/money/format";

const currencyOrder: CurrencyCode[] = ["USD", "KHR"];

export type MoneyTotalInput = {
  amount: number | null;
  currency: CurrencyCode | null;
  direction?: string | null;
};

export function formatMoneyTotals(
  entries: MoneyTotalInput[],
  fallbackCurrency: CurrencyCode = "USD",
) {
  const totals = new Map<CurrencyCode, number>();

  for (const entry of entries) {
    if (!entry.currency || entry.amount === null) {
      continue;
    }

    const sign = entry.direction === "expense" ? -1 : 1;
    const currentTotal = totals.get(entry.currency) ?? 0;
    totals.set(entry.currency, currentTotal + Number(entry.amount) * sign);
  }

  const nonZeroTotals = Array.from(totals.entries()).filter(
    ([, amount]) => amount !== 0,
  );

  if (nonZeroTotals.length === 0) {
    return formatMoney(0, fallbackCurrency);
  }

  return nonZeroTotals
    .sort(
      ([firstCurrency], [secondCurrency]) =>
        currencyOrder.indexOf(firstCurrency) - currencyOrder.indexOf(secondCurrency),
    )
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" / ");
}

export function formatMoneyTotalsDisplay(
  entries: MoneyTotalInput[],
  settings?: Partial<CurrencyDisplaySettings> | null,
): MoneyDisplayValue {
  const normalizedSettings = normalizeCurrencyDisplaySettings(settings);
  const secondaryCurrency = getSecondaryCurrency(
    normalizedSettings.preferredCurrency,
  );
  let primaryTotal = 0;
  let secondaryTotal = 0;

  for (const entry of entries) {
    if (!entry.currency || entry.amount === null) {
      continue;
    }

    const sign = entry.direction === "expense" ? -1 : 1;
    const signedAmount = Number(entry.amount) * sign;
    primaryTotal += convertMoney(
      signedAmount,
      entry.currency,
      normalizedSettings.preferredCurrency,
      normalizedSettings.khrPerUsd,
    );
    secondaryTotal += convertMoney(
      signedAmount,
      entry.currency,
      secondaryCurrency,
      normalizedSettings.khrPerUsd,
    );
  }

  return {
    primary: formatMoney(primaryTotal, normalizedSettings.preferredCurrency),
    primaryCurrency: normalizedSettings.preferredCurrency,
    secondary: formatMoney(secondaryTotal, secondaryCurrency),
    secondaryCurrency,
  };
}
