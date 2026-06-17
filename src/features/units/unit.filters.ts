import type {
  UnitArchiveState,
  UnitSortKey,
  UnitStatusFilter,
  UnitViewQuery,
} from "@/features/units/unit.types";

export const DEFAULT_UNIT_ARCHIVE_STATE: UnitArchiveState = "active";
export const DEFAULT_UNIT_PAGE_SIZE = 50;
export const UNIT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_UNIT_SORT: UnitSortKey = "property_asc";

type UnitSearchParams = Record<string, string | string[] | undefined>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUnitSearchParams(params: UnitSearchParams): UnitViewQuery {
  return {
    archiveState: parseUnitArchiveState(params.archiveState),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: parseUuidFilter(params.propertyId),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
}

export function parseUnitArchiveState(
  value: string | string[] | undefined,
): UnitArchiveState {
  const archiveState = getFirstValue(value);

  if (archiveState === "archived" || archiveState === "all") {
    return archiveState;
  }

  return DEFAULT_UNIT_ARCHIVE_STATE;
}

function parseStatus(value: string | string[] | undefined): UnitStatusFilter {
  const candidate = getFirstValue(value);

  return candidate === "occupied" ||
    candidate === "vacant" ||
    candidate === "reserved" ||
    candidate === "maintenance" ||
    candidate === "inactive"
    ? candidate
    : "all";
}

function parseSort(value: string | string[] | undefined): UnitSortKey {
  const candidate = getFirstValue(value);

  return candidate === "unit_asc" ||
    candidate === "status_asc" ||
    candidate === "rent_desc" ||
    candidate === "net_desc"
    ? candidate
    : DEFAULT_UNIT_SORT;
}

function parseUuidFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : "all";
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = parsePositiveInteger(value, DEFAULT_UNIT_PAGE_SIZE);

  return UNIT_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof UNIT_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_UNIT_PAGE_SIZE;
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
