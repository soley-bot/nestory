export function parseExactMoneyToCents(value: number | string): bigint {
  const isNumberBoundary = typeof value === "number";
  const serialized = isNumberBoundary ? serializeSafeNumber(value) : value;
  const input = serialized.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(input);

  if (!match) {
    throw new Error(
      `Property cash money must have at most two decimal places: ${value}`,
    );
  }

  const [, sign, whole, fraction = ""] = match;
  const cents =
    BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const signedCents = sign === "-" ? -cents : cents;

  if (
    isNumberBoundary &&
    (signedCents > BigInt(Number.MAX_SAFE_INTEGER) ||
      signedCents < BigInt(Number.MIN_SAFE_INTEGER))
  ) {
    throw new Error(
      `Property cash number must serialize to safe integer cents: ${value}`,
    );
  }

  return signedCents;
}

export function formatExactCents(value: bigint): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const sign = value < zero ? "-" : "";
  const absolute = value < zero ? -value : value;
  return `${sign}${absolute / hundred}.${String(absolute % hundred).padStart(2, "0")}`;
}

function serializeSafeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Property cash number must serialize to safe integer cents: ${value}`,
    );
  }

  const serialized = String(value);
  if (/[eE]/.test(serialized)) {
    throw new Error(
      `Property cash number must serialize to safe integer cents: ${value}`,
    );
  }

  return serialized;
}
