import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Database } from "@/types/database";
import {
  canonicalizeOwnerOpeningAmount,
  canonicalizeSignedOwnerOpeningAmount,
} from "@/features/owner-balances/owner-balance.money";

describe("owner opening exact money", () => {
  it.each([
    ["0", "0.00"],
    ["0.1", "0.10"],
    ["1.23", "1.23"],
    ["999999999999.99", "999999999999.99"],
  ])("canonicalizes %s without crossing a number boundary", (input, expected) => {
    expect(canonicalizeOwnerOpeningAmount(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    " 1.00",
    "1.00 ",
    "+1.00",
    "-1.00",
    "1.001",
    "1,000.00",
    "1e2",
    "00",
    "01.00",
    ".50",
    "9999999999999.99",
    "90071992547409.92",
  ])("rejects noncanonical or overflowing input %j", (input) => {
    expect(() => canonicalizeOwnerOpeningAmount(input)).toThrow(
      "Enter a nonnegative amount with up to 12 integer digits and 2 decimal places.",
    );
  });

  it("normalizes signed database text without arithmetic", () => {
    expect(canonicalizeSignedOwnerOpeningAmount("-10")).toBe("-10.00");
    expect(canonicalizeSignedOwnerOpeningAmount("0.00")).toBe("0.00");
  });

  it("keeps both public RPC amount arguments overridden to strings", () => {
    type SubmitAmount =
      Database["public"]["Functions"]["submit_owner_opening_balance"]["Args"]["p_amount"];
    type CorrectionAmount =
      Database["public"]["Functions"]["submit_owner_opening_balance_correction"]["Args"]["p_replacement_amount"];

    expectTypeOf<SubmitAmount>().toEqualTypeOf<string>();
    expectTypeOf<CorrectionAmount>().toEqualTypeOf<string>();
  });

  it("keeps forbidden numeric coercion out of the authoritative feature boundary", () => {
    const root = process.cwd();
    const sources = [
      "src/features/owner-balances/owner-balance.types.ts",
      "src/features/owner-balances/owner-balance.money.ts",
      "src/features/owner-balances/actions.ts",
      "src/features/owner-balances/data/opening-balances.ts",
    ].map((file) => readFileSync(path.join(root, file), "utf8"));
    const source = sources.join("\n");

    expect(source).not.toContain("z.coerce.number");
    expect(source).not.toContain("parseFloat(");
    expect(source).not.toContain("Number(");
    expect(source).not.toMatch(/(?:^|[=(,:]\s*)\+\s*[A-Za-z_(]/m);
    expect(source).not.toMatch(/p_(?:amount|replacement_amount):\s*number/);
  });
});
