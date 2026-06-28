const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SearchParamValue = string | string[] | undefined;

export function getFirstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function getTrimmedSearchParam(value: SearchParamValue, maxLength = 120) {
  return (getFirstSearchParam(value) || "").trim().slice(0, maxLength);
}

export function getPositiveIntegerSearchParam(
  value: SearchParamValue,
  fallback: number,
) {
  const parsed = Number.parseInt(getFirstSearchParam(value) ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getUuidSearchParam(value: SearchParamValue) {
  const candidate = getFirstSearchParam(value);

  return candidate && uuidPattern.test(candidate) ? candidate : undefined;
}

export function getUuidOrAllSearchParam(value: SearchParamValue) {
  return getUuidSearchParam(value) ?? "all";
}

export function getNullableUuidSearchParam(value: SearchParamValue) {
  return getUuidSearchParam(value) ?? null;
}
