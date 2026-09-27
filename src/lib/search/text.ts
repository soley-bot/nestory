/** Literal, word-based matching shared by workspace search and registers. */
export function normalizeSearchText(value: string) {
  return value
    .toWellFormed()
    .normalize("NFKC")
    .replace(/\\[tnr]/g, " ")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

export function searchTokens(value: string) {
  return [...new Set(normalizeSearchText(value).split(" ").filter(Boolean))];
}

export function matchesSearchText(
  query: string,
  values: readonly (string | null | undefined)[],
) {
  const text = normalizeSearchText(values.filter(Boolean).join(" "));
  return searchTokens(query).every((token) => {
    if (text.includes(token)) return true;
    const compact = token.replace(/[#.\-]/g, "");
    return compact.length > 0 && values.some(value =>
      normalizeSearchText(value ?? "").split(/\s+/u).some(word => word.replace(/[#.\-]/g, "").includes(compact)),
    );
  });
}

export function escapeSearchPattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
