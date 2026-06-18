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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLeaseSearchParams(
  params: LeaseSearchParams,
): LeaseViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: parseUuidFilter(params.propertyId),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
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

function parseStatus(value: string | string[] | undefined): LeaseStatusFilter {
  const candidate = getFirstValue(value);

  return candidate === "active" ||
    candidate === "cancelled" ||
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
