import { describe, expect, it } from "vitest";
import { normalizeCurrencyInput } from "./currency-input";
describe("USD amount pasted from a spreadsheet", () => {
  it.each([["$198.80", "198.80"], [" USD 1,234.50 ", "1234.50"], ["$ 1\u00a0234.50", "1234.50"], ["0.00", "0.00"], ["198.", "198."]])("normalizes %s", (input, output) => expect(normalizeCurrencyInput(input)).toBe(output));
  it.each(["1,98.80", "1 98", "1.234,50", "-100", "(100)", "100+20", "1e3", "€10", "$1.234", "100\t200", "100\n200"])("leaves ambiguous input for validation: %s", input => expect(normalizeCurrencyInput(input)).toBe(input));
});
