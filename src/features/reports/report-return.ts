/** Only internal report views may be used as correction return destinations. */
export function reportReturnHref(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000 || !value.startsWith("/") || value.startsWith("//")) return;
  const url = new URL(value, "https://nestory.invalid");
  if (url.origin !== "https://nestory.invalid" || !["/balances", "/reports/monthly-owner-activity", "/reports/unit-profit-loss"].includes(url.pathname)) return;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withReportReturn(destination: string, returnTo?: string) {
  const safeReturn = reportReturnHref(returnTo);
  if (!safeReturn) return destination;
  const url = new URL(destination, "https://nestory.invalid");
  if (url.origin !== "https://nestory.invalid") return destination;
  url.searchParams.set("returnTo", safeReturn);
  return `${url.pathname}${url.search}${url.hash}`;
}
