import type { CanonicalOwnerBalanceAmount } from "./owner-balance.types";

const UNSIGNED_AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/;
const SIGNED_AMOUNT = /^(-?)(?:0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/;
const INVALID_AMOUNT_MESSAGE =
  "Enter a nonnegative amount with up to 12 integer digits and 2 decimal places.";

export function canonicalizeOwnerOpeningAmount(
  input: string,
): CanonicalOwnerBalanceAmount {
  const match = UNSIGNED_AMOUNT.exec(input);
  if (!match) throw new Error(INVALID_AMOUNT_MESSAGE);

  return appendMinorUnits(input, match[1]) as CanonicalOwnerBalanceAmount;
}

export function canonicalizeSignedOwnerOpeningAmount(
  input: string,
): CanonicalOwnerBalanceAmount {
  const match = SIGNED_AMOUNT.exec(input);
  if (!match) throw new Error("Invalid exact owner-opening amount returned by the database.");

  const canonical = appendMinorUnits(input, match[2]);
  return (canonical === "-0.00" ? "0.00" : canonical) as CanonicalOwnerBalanceAmount;
}

function appendMinorUnits(input: string, fraction: string | undefined): string {
  const whole = input.includes(".") ? input.slice(0, input.indexOf(".")) : input;
  return `${whole}.${(fraction ?? "").padEnd(2, "0")}`;
}
