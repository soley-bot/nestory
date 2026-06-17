import type {
  LedgerArchiveState,
  LedgerEntry,
  LedgerPagination,
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
  direction: "all",
  page: 1,
  pageSize: DEFAULT_LEDGER_PAGE_SIZE,
  propertyId: "all",
  query: "",
  sort: DEFAULT_LEDGER_SORT,
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LedgerFilterOptions = {
  archiveState?: LedgerArchiveState;
  direction: string;
  propertyId: string;
  query: string;
};

type LedgerSearchParams = Record<string, string | string[] | undefined>;

export function filterLedgerEntries(
  entries: LedgerEntry[],
  { archiveState = "active", direction, propertyId, query }: LedgerFilterOptions,
) {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return entries.filter((entry) => {
    const matchesDirection =
      direction === "all" || entry.direction === direction;
    const matchesProperty =
      propertyId === "all" || entry.propertyId === propertyId;
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

    return matchesArchiveState && matchesDirection && matchesProperty && matchesQuery;
  });
}

export function parseLedgerSearchParams(
  params: LedgerSearchParams,
): LedgerViewQuery {
  return normalizeLedgerViewQuery({
    archiveState: parseArchiveState(params.archiveState),
    direction: parseDirection(params.direction),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: parsePropertyId(params.propertyId),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    sort: parseSort(params.sort),
  });
}

export function normalizeLedgerViewQuery(
  query: Partial<LedgerViewQuery>,
): LedgerViewQuery {
  return {
    archiveState: parseArchiveState(query.archiveState),
    direction: parseDirection(query.direction),
    page: Math.max(1, Math.floor(query.page ?? DEFAULT_LEDGER_VIEW_QUERY.page)),
    pageSize: parsePageSize(String(query.pageSize ?? "")),
    propertyId: query.propertyId?.trim() || DEFAULT_LEDGER_VIEW_QUERY.propertyId,
    query: (query.query ?? "").trim().slice(0, 120),
    sort: parseSort(query.sort),
  };
}

export function isDefaultLedgerViewQuery(query: LedgerViewQuery) {
  return (
    query.archiveState === DEFAULT_LEDGER_VIEW_QUERY.archiveState &&
    query.direction === DEFAULT_LEDGER_VIEW_QUERY.direction &&
    query.page === DEFAULT_LEDGER_VIEW_QUERY.page &&
    query.pageSize === DEFAULT_LEDGER_VIEW_QUERY.pageSize &&
    query.propertyId === DEFAULT_LEDGER_VIEW_QUERY.propertyId &&
    query.query === DEFAULT_LEDGER_VIEW_QUERY.query &&
    query.sort === DEFAULT_LEDGER_VIEW_QUERY.sort
  );
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

function parseDirection(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate === "income" || candidate === "expense" ? candidate : "all";
}

function parsePropertyId(value: string | string[] | undefined) {
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
