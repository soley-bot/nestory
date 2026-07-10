import type {
  OverviewFinanceView,
  OverviewLens,
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
const overviewFinanceViews: OverviewFinanceView[] = [
  "collections",
  "expenses",
  "management-fees",
  "owner-statements",
  "transactions",
];
const overviewReviews: OverviewReview[] = [
  "all",
  "negative",
  "arrears",
  "bills",
  "statement-blocked",
];
const legacyFinanceViews: Record<string, OverviewFinanceView> = {
  "company-pnl": "collections",
  ledger: "transactions",
  "owner-receivables": "management-fees",
  "property-ranking": "collections",
};

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
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    review: parseReview(params.review),
  };
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

function normalizeFinanceView(value: string | undefined): OverviewFinanceView {
  if (value && legacyFinanceViews[value]) {
    return legacyFinanceViews[value];
  }

  return overviewFinanceViews.includes(value as OverviewFinanceView)
    ? (value as OverviewFinanceView)
    : "collections";
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
