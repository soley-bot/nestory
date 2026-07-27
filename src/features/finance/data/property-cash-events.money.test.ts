import { describe, expect, it } from "vitest";
import {
  formatExactCents,
  parseExactMoneyToCents,
} from "@/features/finance/data/property-cash-events.money";

describe("property cash exact money", () => {
  it.each([
    ["12", BigInt(1_200)],
    ["12.3", BigInt(1_230)],
    ["12.34", BigInt(1_234)],
    ["-0.01", BigInt(-1)],
  ])("parses %s without floating-point rounding", (value, expected) => {
    expect(parseExactMoneyToCents(value)).toBe(expected);
  });

  it.each(["1.001", "1e2", "NaN", ""])(
    "rejects an inexact decimal boundary value %s",
    (value) => {
      expect(() => parseExactMoneyToCents(value)).toThrow(
        "at most two decimal places",
      );
    },
  );

  it("rejects a numeric value whose cents cannot be serialized safely", () => {
    expect(() => parseExactMoneyToCents(90_071_992_547_409.92)).toThrow(
      "safe integer cents",
    );
  });

  it("accepts a safe two-place RPC number despite binary multiplication noise", () => {
    expect(parseExactMoneyToCents(0.29)).toBe(BigInt(29));
  });

  it("formats bigint cents as an exact boundary string", () => {
    expect(formatExactCents(BigInt(-1_230))).toBe("-12.30");
    expect(formatExactCents(BigInt(5))).toBe("0.05");
  });
});
