export type LegacyRedirectSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export async function buildLegacyRedirect(
  target: string,
  searchParams: LegacyRedirectSearchParams,
) {
  const [pathname, targetQuery = ""] = target.split("?", 2);
  const destination = new URLSearchParams(targetQuery);
  const incoming = await searchParams;

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || destination.has(key)) {
      continue;
    }

    for (const item of Array.isArray(value) ? value : [value]) {
      destination.append(key, item);
    }
  }

  const query = destination.toString();
  return query ? `${pathname}?${query}` : pathname;
}
