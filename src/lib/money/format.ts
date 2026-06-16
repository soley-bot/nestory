export type CurrencyCode = "USD" | "KHR";

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: CurrencyCode) {
  const key = `${currency}:en-US`;
  const existingFormatter = currencyFormatters.get(key);

  if (existingFormatter) {
    return existingFormatter.format(amount);
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KHR" ? 0 : 2,
  });

  currencyFormatters.set(key, formatter);
  return formatter.format(amount);
}
