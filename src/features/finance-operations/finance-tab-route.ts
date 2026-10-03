import { reportReturnHref } from "@/features/reports/report-return";

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
  const returnTo = reportReturnHref(new URLSearchParams(originQuery).get("returnTo"));
  if (returnTo) params.set("returnTo", returnTo);
  return `${base}?${params}`;
}
