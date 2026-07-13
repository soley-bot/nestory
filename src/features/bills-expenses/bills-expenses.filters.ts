import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";
import type {
  BillsExpenseTypeFilter,
  BillsExpensesPagination,
  BillsExpenseStatusFilter,
  BillsExpensesViewQuery,
} from "@/features/bills-expenses/bills-expenses.types";

export const BILLS_EXPENSES_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_BILLS_EXPENSES_PAGE_SIZE = 50;

type BillsExpensesSearchParams = Record<string, SearchParamValue>;

export function parseBillsExpensesSearchParams(
  params: BillsExpensesSearchParams,
  currentDate = new Date(),
): BillsExpensesViewQuery {
  return {
    dateBasis: getFirstSearchParam(params.dateBasis) === "paid" ? "paid" : "invoice",
    expenseType: parseExpenseType(params.expenseType),
    month: parseMonth(params.month, currentDate),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    query: getTrimmedSearchParam(params.query),
    status: parseStatus(params.status),
    unitId: getUuidOrAllSearchParam(params.unitId),
  };
}

export function buildBillsExpensesPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): BillsExpensesPagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = totalCount === 0 ? 0 : Math.min(safePage * pageSize, totalCount);

  return { from, page: safePage, pageSize, to, totalCount, totalPages };
}

export function getBillsExpensesMonthScope(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;

  return {
    before: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    from: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
  };
}

function parseMonth(value: SearchParamValue, currentDate: Date) {
  const candidate = getFirstSearchParam(value)?.trim() ?? "";

  if (/^\d{4}-\d{2}$/.test(candidate)) {
    return candidate;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).formatToParts(currentDate);
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";

  return `${year}-${month}`;
}

function parsePageSize(value: SearchParamValue) {
  const candidate = getPositiveIntegerSearchParam(
    value,
    DEFAULT_BILLS_EXPENSES_PAGE_SIZE,
  );

  return BILLS_EXPENSES_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof BILLS_EXPENSES_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_BILLS_EXPENSES_PAGE_SIZE;
}

function parseStatus(value: SearchParamValue): BillsExpenseStatusFilter {
  const candidate = getFirstSearchParam(value);

  return candidate === "draft" ||
    candidate === "approved" ||
    candidate === "posted" ||
    candidate === "paid"
    ? candidate
    : "all";
}

function parseExpenseType(value: SearchParamValue): BillsExpenseTypeFilter {
  const candidate = getFirstSearchParam(value);
  return candidate === "vendor_bill" || candidate === "maintenance" || candidate === "utilities" || candidate === "supplies" || candidate === "owner_payout" || candidate === "refund" || candidate === "other" ? candidate : "all";
}
