/** Accept familiar USD spreadsheet formatting without guessing decimal separators. */
export function normalizeCurrencyInput(value: string): string {
  const text = value.trim().replace(/^(?:USD\s*\$?|\$)\s*/i, "").trim();
  // Spaces may group thousands, but arbitrary spaces inside a number are invalid.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:\.\d{0,2})?$/.test(text)) return value;
  return text.replace(/[, \u00a0\u202f]/g, "");
}
