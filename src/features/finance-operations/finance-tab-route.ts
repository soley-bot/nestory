import { workflowReturnHref } from "@/features/leases/workflow-return";

const filterKeys: Record<string, string[]> = {
  rent: ["due", "overdueDays", "q", "sort", "status"],
  expenses: ["expenseMonth"],
  transactions: [],
  account: [],
};

export function financeTabHref(base: string, view: string, query: string, originQuery: string) {
  const source = new URLSearchParams(query);
  const params = new URLSearchParams({ view: view === "account" ? "owner" : view });
  for (const key of filterKeys[view] ?? []) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  const returnTo = financeReturnHref(new URLSearchParams(originQuery).get("returnTo"));
  if (returnTo) params.set("returnTo", returnTo);
  return `${base}?${params}`;
}

export function financeReturnHref(value: unknown) {
  const href = workflowReturnHref(value);
  if (!href || typeof value !== "string" || !/^\/leases\/[a-zA-Z0-9_-]+$/.test(href.split("?", 1)[0])) return href;
  const origin = workflowReturnHref(new URL(value, "https://nestory.invalid").searchParams.get("returnTo"));
  if (!origin) return href;
  const url = new URL(href, "https://nestory.invalid");
  url.searchParams.set("returnTo", origin);
  return `${url.pathname}${url.search}`;
}
