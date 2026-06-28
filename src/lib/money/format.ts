export type CurrencyCode = "USD";

export type MoneyDisplayValue = {
  primary: string;
};

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: CurrencyCode = "USD") {
  const key = `${currency}:en-US`;
  const existingFormatter = currencyFormatters.get(key);

  if (existingFormatter) {
    return formatWithCurrencyCode(amount, currency, existingFormatter);
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export function formatMoneyDisplay(
  amount: number,
  _currency: CurrencyCode | null = "USD",
): MoneyDisplayValue {
  void _currency;

  return {
    primary: formatMoney(amount),
  };
}
