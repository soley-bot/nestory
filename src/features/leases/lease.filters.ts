import type {
  LeaseArchiveState,
  LeaseSortKey,
  LeaseStatusFilter,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

export const DEFAULT_LEASE_ARCHIVE_STATE: LeaseArchiveState = "active";
export const DEFAULT_LEASE_PAGE_SIZE = 50;
export const LEASE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_LEASE_SORT: LeaseSortKey = "start_desc";

type LeaseSearchParams = Record<string, string | string[] | undefined>;
type DateScope = {
  before?: string;
  from?: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLeaseSearchParams(
  params: LeaseSearchParams,
): LeaseViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    endMonth: parseMonthFilter(params.endMonth),
    endsWithinDays: parseEndsWithin(params.endsWithin),
    leaseId: parseOptionalUuid(params.leaseId),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: parseUuidFilter(params.propertyId),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
    unitId: parseUuidFilter(params.unitId),
  };
}

export function getLeaseEndDateScope(
  query: Pick<LeaseViewQuery, "endMonth" | "endsWithinDays">,
  currentDate = new Date(),
): DateScope {
  let from: string | undefined;
  let before: string | undefined;

  if (query.endsWithinDays !== null) {
    const today = getBusinessDateString(currentDate);
    from = maxDateString(from, today);
    before = minDateString(before, addDays(today, query.endsWithinDays + 1));
  }

  if (query.endMonth) {
    const month = getMonthScope(query.endMonth);
    from = maxDateString(from, month.from);
    before = minDateString(before, month.before);
  }

  return { before, from };
}

function parseArchiveState(
  value: string | string[] | undefined,
): LeaseArchiveState {
  const candidate = getFirstValue(value);

  if (candidate === "archived" || candidate === "all") {
    return candidate;
  }

  return DEFAULT_LEASE_ARCHIVE_STATE;
}

function parseEndsWithin(value: string | string[] | undefined) {
  const candidate = getFirstValue(value)?.trim() ?? "";
  const match = candidate.match(/^([1-9]\d*)d$/);

  if (!match) {
    return null;
  }

  const days = Number(match[1]);

  return Number.isSafeInteger(days) ? days : null;
}

function parseMonthFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value)?.trim() ?? "";

  if (!/^\d{4}-\d{2}$/.test(candidate)) {
    return "";
  }

  const month = Number(candidate.slice(5, 7));

  return month >= 1 && month <= 12 ? candidate : "";
}

function parseStatus(value: string | string[] | undefined): LeaseStatusFilter {
  const candidate = getFirstValue(value);

  return candidate === "active" ||
    candidate === "cancelled" ||
    candidate === "current" ||
    candidate === "draft" ||
    candidate === "ended" ||
    candidate === "notice_given" ||
    candidate === "terminated"
    ? candidate
    : "all";
}

function parseSort(value: string | string[] | undefined): LeaseSortKey {
  const candidate = getFirstValue(value);

  return candidate === "end_asc" ||
    candidate === "rent_desc" ||
    candidate === "tenant_asc"
    ? candidate
    : DEFAULT_LEASE_SORT;
}

function parseUuidFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : "all";
}

function parseOptionalUuid(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : null;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = parsePositiveInteger(value, DEFAULT_LEASE_PAGE_SIZE);

  return LEASE_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof LEASE_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_LEASE_PAGE_SIZE;
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

function getMonthScope(monthValue: string): Required<DateScope> {
  const year = Number(monthValue.slice(0, 4));
  const month = Number(monthValue.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  return {
    before: formatDateString(nextMonthYear, nextMonth, 1),
    from: formatDateString(year, month, 1),
  };
}

function getBusinessDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return formatDateString(getPart("year"), getPart("month"), getPart("day"));
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
