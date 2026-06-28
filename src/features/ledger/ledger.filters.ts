import type {
  LedgerArchiveState,
  LedgerEntry,
  LedgerPagination,
  LedgerPeriodFilter,
  LedgerSnapshot,
  LedgerSortKey,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";
import type { CurrencyDisplaySettings } from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";

export const DEFAULT_LEDGER_PAGE_SIZE = 50;
export const LEDGER_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_LEDGER_SORT: LedgerSortKey = "date_desc";
export const DEFAULT_LEDGER_VIEW_QUERY: LedgerViewQuery = {
  archiveState: "active",
  dateFrom: "",
  dateTo: "",
  direction: "all",
  minAmount: null,
  page: 1,
  pageSize: DEFAULT_LEDGER_PAGE_SIZE,
  period: "all",
  propertyId: "all",
  query: "",
  sort: DEFAULT_LEDGER_SORT,
  unitId: "all",
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LedgerFilterOptions = {
  archiveState?: LedgerArchiveState;
  currentDate?: Date;
  dateFrom?: string;
  dateTo?: string;
  direction: string;
  minAmount?: number | null;
  period?: LedgerPeriodFilter;
  propertyId: string;
  query: string;
  unitId?: string;
};

type LedgerSearchParams = Record<string, string | string[] | undefined>;
type DateScope = {
  before?: string;
  from?: string;
};

export function filterLedgerEntries(
  entries: LedgerEntry[],
  {
    archiveState = "active",
    currentDate,
    dateFrom = "",
    dateTo = "",
    direction,
    minAmount = null,
    period = "all",
    propertyId,
    query,
    unitId = "all",
  }: LedgerFilterOptions,
) {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const dateScope = getLedgerTransactionDateScope(
    { dateFrom, dateTo, period },
    currentDate,
  );

  return entries.filter((entry) => {
    const matchesDirection =
      direction === "all" || entry.direction === direction;
    const matchesProperty =
      propertyId === "all" || entry.propertyId === propertyId;
    const matchesUnit = unitId === "all" || entry.unitId === unitId;
    const matchesArchiveState =
      archiveState === "all" ||
      (archiveState === "archived"
        ? Boolean(entry.archivedAt)
        : !entry.archivedAt);
    const haystack = [
      entry.category,
      entry.description,
      entry.direction,
      entry.propertyCode,
      entry.propertyName,
      entry.relatedTimelineEvent?.title ?? "",
      entry.unitNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));
    const matchesDateScope = isDateInScope(
      entry.transactionDate,
      dateScope,
    );
    const matchesMinAmount = minAmount === null || entry.amount >= minAmount;

    return (
      matchesArchiveState &&
      matchesDateScope &&
      matchesDirection &&
      matchesMinAmount &&
      matchesProperty &&
      matchesUnit &&
      matchesQuery
    );
  });
}

export function parseLedgerSearchParams(
  params: LedgerSearchParams,
): LedgerViewQuery {
  return normalizeLedgerViewQuery({
    archiveState: parseArchiveState(params.archiveState),
    dateFrom: parseDateFilter(params.dateFrom),
    dateTo: parseDateFilter(params.dateTo),
    direction: parseDirection(params.direction),
    minAmount: parseMinAmount(params.minAmount),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    period: parsePeriod(params.period),
    propertyId: parsePropertyId(params.propertyId),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    sort: parseSort(params.sort),
    unitId: parseUnitId(params.unitId),
  });
}

export function normalizeLedgerViewQuery(
  query: Partial<LedgerViewQuery>,
): LedgerViewQuery {
  return {
    archiveState: parseArchiveState(query.archiveState),
    dateFrom: parseDateFilter(query.dateFrom),
    dateTo: parseDateFilter(query.dateTo),
    direction: parseDirection(query.direction),
    minAmount: parseMinAmount(query.minAmount),
    page: Math.max(1, Math.floor(query.page ?? DEFAULT_LEDGER_VIEW_QUERY.page)),
    pageSize: parsePageSize(String(query.pageSize ?? "")),
    period: parsePeriod(query.period),
    propertyId: query.propertyId?.trim() || DEFAULT_LEDGER_VIEW_QUERY.propertyId,
    query: (query.query ?? "").trim().slice(0, 120),
    sort: parseSort(query.sort),
    unitId: parseUnitId(query.unitId),
  };
}

export function isDefaultLedgerViewQuery(query: LedgerViewQuery) {
  return (
    query.archiveState === DEFAULT_LEDGER_VIEW_QUERY.archiveState &&
    query.dateFrom === DEFAULT_LEDGER_VIEW_QUERY.dateFrom &&
    query.dateTo === DEFAULT_LEDGER_VIEW_QUERY.dateTo &&
    query.direction === DEFAULT_LEDGER_VIEW_QUERY.direction &&
    query.minAmount === DEFAULT_LEDGER_VIEW_QUERY.minAmount &&
    query.page === DEFAULT_LEDGER_VIEW_QUERY.page &&
    query.pageSize === DEFAULT_LEDGER_VIEW_QUERY.pageSize &&
    query.period === DEFAULT_LEDGER_VIEW_QUERY.period &&
    query.propertyId === DEFAULT_LEDGER_VIEW_QUERY.propertyId &&
    query.query === DEFAULT_LEDGER_VIEW_QUERY.query &&
    query.sort === DEFAULT_LEDGER_VIEW_QUERY.sort &&
    query.unitId === DEFAULT_LEDGER_VIEW_QUERY.unitId
  );
}

export function getLedgerTransactionDateScope(
  query: Pick<LedgerViewQuery, "dateFrom" | "dateTo" | "period">,
  currentDate = new Date(),
): DateScope {
  let from: string | undefined;
  let before: string | undefined;

  if (query.period === "current_month") {
    const currentMonth = getBusinessMonthScope(currentDate);
    from = currentMonth.from;
    before = currentMonth.before;
  } else if (query.period === "last_30_days") {
    const recentWindow = getLastThirtyDaysScope(currentDate);
    from = recentWindow.from;
    before = recentWindow.before;
  }

  if (query.dateFrom) {
    from = maxDateString(from, query.dateFrom);
  }

  if (query.dateTo) {
    before = minDateString(before, addDays(query.dateTo, 1));
  }

  return { before, from };
}

export function buildLedgerPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): LedgerPagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = totalCount === 0 ? 0 : Math.min(safePage * pageSize, totalCount);

  return {
    from,
    page: safePage,
    pageSize,
    to,
    totalCount,
    totalPages,
  };
}

export function sortLedgerEntries(entries: LedgerEntry[], sort: LedgerSortKey) {
  return [...entries].sort((first, second) => {
    const fallback = compareStrings(first.id, second.id);

    if (sort === "amount_asc") {
      return first.amount - second.amount || fallback;
    }

    if (sort === "amount_desc") {
      return second.amount - first.amount || fallback;
    }

    if (sort === "property_asc") {
      return (
        compareStrings(first.propertyCode, second.propertyCode) ||
        compareStrings(first.transactionDate, second.transactionDate) ||
        fallback
      );
    }

    if (sort === "date_asc") {
      return (
        compareStrings(first.transactionDate, second.transactionDate) ||
        compareStrings(first.category, second.category) ||
        fallback
      );
    }

    return (
      compareStrings(second.transactionDate, first.transactionDate) ||
      compareStrings(first.category, second.category) ||
      fallback
    );
  });
}

export function getLedgerPageEntries(
  entries: LedgerEntry[],
  pagination: LedgerPagination,
) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return entries.slice(start, pagination.to);
}

export function buildLedgerSnapshotFromEntries(
  entries: LedgerEntry[],
  lockedPeriodCount: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
): LedgerSnapshot {
  return {
    entryCount: String(entries.length),
    lockedPeriodCount,
    netIncome: formatMoneyTotalsDisplay(entries, currencySettings),
    totalExpense: formatMoneyTotalsDisplay(
      entries
        .filter((entry) => entry.direction === "expense")
        .map((entry) => ({ amount: entry.amount, currency: entry.currency })),
      currencySettings,
    ),
    totalIncome: formatMoneyTotalsDisplay(
      entries
        .filter((entry) => entry.direction === "income")
        .map((entry) => ({ amount: entry.amount, currency: entry.currency })),
      currencySettings,
    ),
  };
}

function parseArchiveState(value: string | string[] | undefined): LedgerArchiveState {
  const candidate = getFirstValue(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parseDateFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value)?.trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return "";
  }

  const date = new Date(`${candidate}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === candidate
    ? candidate
    : "";
}

function parseDirection(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate === "income" || candidate === "expense" ? candidate : "all";
}

function parseMinAmount(
  value: number | string | string[] | null | undefined,
) {
  if (value === null || value === undefined) {
    return null;
  }

  const rawValue = Array.isArray(value)
    ? value[0]
    : typeof value === "number"
      ? String(value)
      : value?.trim();
  const candidate = Number(rawValue ?? "");

  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function parsePeriod(
  value: LedgerPeriodFilter | string | string[] | undefined,
): LedgerPeriodFilter {
  const candidate = getFirstValue(value);

  return candidate === "current_month" || candidate === "last_30_days"
    ? candidate
    : "all";
}

function parsePropertyId(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : "all";
}

function parseUnitId(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : "all";
}

function parseSort(value: string | string[] | undefined): LedgerSortKey {
  const candidate = getFirstValue(value);

  return candidate === "date_asc" ||
    candidate === "amount_desc" ||
    candidate === "amount_asc" ||
    candidate === "property_asc"
    ? candidate
    : DEFAULT_LEDGER_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = parsePositiveInteger(value, DEFAULT_LEDGER_PAGE_SIZE);

  return LEDGER_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof LEDGER_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_LEDGER_PAGE_SIZE;
}

function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
) {
  const parsed = Number.parseInt(getFirstValue(value) ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second);
}

function isDateInScope(date: string, scope: DateScope) {
  if (scope.from && date < scope.from) {
    return false;
  }

  if (scope.before && date >= scope.before) {
    return false;
  }

  return true;
}

function getBusinessMonthScope(date: Date): Required<DateScope> {
  const { month, year } = getBusinessDateParts(date);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  return {
    before: formatDateString(nextMonthYear, nextMonth, 1),
    from: formatDateString(year, month, 1),
  };
}

function getLastThirtyDaysScope(date: Date): Required<DateScope> {
  const { day, month, year } = getBusinessDateParts(date);
  const today = formatDateString(year, month, day);

  return {
    before: addDays(today, 1),
    from: addDays(today, -30),
  };
}

function getBusinessDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    day: getPart("day"),
    month: getPart("month"),
    year: getPart("year"),
  };
}

function addDays(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate.toISOString().slice(0, 10);
}

function maxDateString(
  first: string | undefined,
  second: string,
) {
  return first && first > second ? first : second;
}

function minDateString(
  first: string | undefined,
  second: string,
) {
  return first && first < second ? first : second;
}

function formatDateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}
