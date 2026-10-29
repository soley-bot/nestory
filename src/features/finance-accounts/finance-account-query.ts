import type { FinanceAccountClass } from "./finance-accounts.types";

export type FinanceAccountQuery = { query: string; accountClass: "all" | FinanceAccountClass; status: "all" | "active" | "inactive"; page: number; pageSize: number };
export function parseFinanceAccountQuery(params: Record<string, string | string[] | undefined> = {}): FinanceAccountQuery {
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const accountClass = value("accountClass");
  const status = value("status");
  const page = Number(value("page"));
  const pageSize = Number(value("pageSize"));
  return {
    query: value("query").trim().slice(0,200),
    accountClass: ["asset","liability","equity","income","expense"].includes(accountClass) ? accountClass as FinanceAccountClass : "all",
    status: status === "all" || status === "inactive" ? status : "active",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: [10,25,50,100].includes(pageSize) ? pageSize : 50,
  };
}
