import type {
  OverviewFinanceView,
  OverviewLens,
  OverviewPropertySort,
  OverviewReview,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import {
  getFirstSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const overviewLenses: OverviewLens[] = [
  "all",
  "finance",
  "leasing",
  "maintenance",
  "records",
];
const overviewReviews: OverviewReview[] = [
  "all",
  "negative",
  "arrears",
  "bills",
  "statement-blocked",
];
const propertySorts: OverviewPropertySort[] = [
  "property-asc",
  "property-desc",
  "collected-desc",
  "income-desc",
  "expenses-desc",
  "net-desc",
  "fee-desc",
];
export function parseOverviewSearchParams(
  params: Record<string, SearchParamValue>,
  currentDate = new Date(),
): OverviewViewQuery {
  const legacyView = getFirstSearchParam(params.financeView);
  const financeView = normalizeFinanceView(legacyView);

  return {
    financeView,
    lens:
      legacyView === "property-ranking"
        ? "all"
        : normalizeOverviewLens(params.lens),
    month: parseMonth(params.month, currentDate),
    propertyQuery: normalizePropertyQuery(params.propertyQuery),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    review: parseReview(params.review),
    sort: parsePropertySort(params.sort),
  };
}

function normalizePropertyQuery(value: SearchParamValue) {
  return getFirstSearchParam(value)?.trim().slice(0, 80) ?? "";
}

function parsePropertySort(value: SearchParamValue): OverviewPropertySort {
  const firstValue = getFirstSearchParam(value);
  return propertySorts.includes(firstValue as OverviewPropertySort)
    ? (firstValue as OverviewPropertySort)
    : "property-asc";
}

export function getOverviewMonthScope(month: string) {
  const match = month.match(monthPattern);

  if (!match) {
    throw new RangeError(`Invalid overview month: ${month}`);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;

  return {
    from: `${month}-01`,
    before: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

export function buildOverviewHref(
  query: OverviewViewQuery,
  updates: Partial<OverviewViewQuery>,
) {
  const next = { ...query, ...updates };
  const params = new URLSearchParams();
  if (next.lens === "finance") {
    params.set("lens", next.lens);
    params.set("financeView", next.financeView);
  } else if (next.lens !== "all") {
    params.set("lens", next.lens);
  }
  params.set("month", next.month);
  if (next.propertyId !== "all") params.set("propertyId", next.propertyId);
  if (next.review !== "all") params.set("review", next.review);
  if (next.sort && next.sort !== "property-asc") params.set("sort", next.sort);
  return `/overview?${params.toString()}`;
}

function normalizeFinanceView(value: string | undefined): OverviewFinanceView {
  switch (value) {
    case "collections":
    case "expenses":
    case "management-fees":
    case "owner-statements":
    case "transactions":
      return value;
    case "company-pnl":
    case "property-ranking":
      return "collections";
    case "owner-receivables":
      return "management-fees";
    case "ledger":
      return "transactions";
    default:
      return "collections";
  }
}

function normalizeOverviewLens(value: SearchParamValue): OverviewLens {
  const firstValue = getFirstSearchParam(value);

  return overviewLenses.includes(firstValue as OverviewLens)
    ? (firstValue as OverviewLens)
    : "all";
}

function parseMonth(value: SearchParamValue, currentDate: Date) {
  const firstValue = getFirstSearchParam(value);

  if (firstValue && monthPattern.test(firstValue)) {
    return firstValue;
  }

  return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
}

function parseReview(value: SearchParamValue): OverviewReview {
  const firstValue = getFirstSearchParam(value);

  return overviewReviews.includes(firstValue as OverviewReview)
    ? (firstValue as OverviewReview)
    : "all";
}
