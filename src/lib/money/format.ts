export type CurrencyCode = "USD" | "KHR";

export type CurrencyDisplaySettings = {
  khrPerUsd: number;
  preferredCurrency: CurrencyCode;
};

export type MoneyDisplayValue = {
  primary: string;
  primaryCurrency: CurrencyCode;
  secondary: string;
  secondaryCurrency: CurrencyCode;
};

export const DEFAULT_CURRENCY_DISPLAY_SETTINGS: CurrencyDisplaySettings = {
  khrPerUsd: 4100,
  preferredCurrency: "USD",
};

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: CurrencyCode) {
  const key = `${currency}:en-US`;
  const existingFormatter = currencyFormatters.get(key);

  if (existingFormatter) {
    return formatWithCurrencyCode(amount, currency, existingFormatter);
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: currency === "KHR" ? 0 : 2,
    maximumFractionDigits: currency === "KHR" ? 0 : 2,
  });

  currencyFormatters.set(key, formatter);
  return formatWithCurrencyCode(amount, currency, formatter);
}

function formatWithCurrencyCode(
  amount: number,
  currency: CurrencyCode,
  formatter: Intl.NumberFormat,
) {
  const sign = amount < 0 ? "-" : "";

  return `${sign}${currency} ${formatter.format(Math.abs(amount))}`;
}

export function normalizeCurrencyDisplaySettings(
  settings?: Partial<CurrencyDisplaySettings> | null,
): CurrencyDisplaySettings {
  const preferredCurrency =
    settings?.preferredCurrency === "KHR" ? "KHR" : "USD";
  const khrPerUsd = Number(settings?.khrPerUsd);

  return {
    khrPerUsd:
      Number.isFinite(khrPerUsd) && khrPerUsd > 0
        ? khrPerUsd
        : DEFAULT_CURRENCY_DISPLAY_SETTINGS.khrPerUsd,
    preferredCurrency,
  };
}

export function getSecondaryCurrency(currency: CurrencyCode): CurrencyCode {
  return currency === "USD" ? "KHR" : "USD";
}

export function convertMoney(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  khrPerUsd: number,
) {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  if (fromCurrency === "USD") {
    return amount * khrPerUsd;
  }

  return amount / khrPerUsd;
}

export function formatMoneyDisplay(
  amount: number,
  currency: CurrencyCode,
  settings?: Partial<CurrencyDisplaySettings> | null,
): MoneyDisplayValue {
  const normalizedSettings = normalizeCurrencyDisplaySettings(settings);
  const secondaryCurrency = getSecondaryCurrency(
    normalizedSettings.preferredCurrency,
  );

  return {
    primary: formatMoney(
      convertMoney(
        amount,
        currency,
        normalizedSettings.preferredCurrency,
        normalizedSettings.khrPerUsd,
      ),
      normalizedSettings.preferredCurrency,
    ),
    primaryCurrency: normalizedSettings.preferredCurrency,
    secondary: formatMoney(
      convertMoney(amount, currency, secondaryCurrency, normalizedSettings.khrPerUsd),
      secondaryCurrency,
    ),
    secondaryCurrency,
  };
}
