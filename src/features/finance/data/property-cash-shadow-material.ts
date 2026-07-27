import { createHash } from "node:crypto";

export function buildPropertyCashShadowMaterialStateToken(value: unknown) {
  const normalized = normalizeMaterialState(value);

  return {
    hash: createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
    rowCount: countMaterialRows(normalized),
  };
}

function normalizeMaterialState(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeMaterialState);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, nested]) => [key, normalizeMaterialState(nested)]),
    );
  }
  return value;
}

function countMaterialRows(value: unknown): number {
  if (Array.isArray(value)) {
    return (
      value.length +
      value.reduce(
        (total, nested) => total + countMaterialRows(nested),
        0,
      )
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce(
      (total, nested) => total + countMaterialRows(nested),
      0,
    );
  }
  return 0;
}
