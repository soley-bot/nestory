import type {
  UnitArchiveState,
  UnitLeaseStatusFilter,
  UnitOccupancyFilter,
  UnitSortKey,
  UnitStatusFilter,
  UnitViewQuery,
} from "@/features/units/unit.types";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

export const DEFAULT_UNIT_ARCHIVE_STATE: UnitArchiveState = "active";
export const DEFAULT_UNIT_PAGE_SIZE = 50;
export const UNIT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_UNIT_SORT: UnitSortKey = "property_asc";

type UnitSearchParams = Record<string, SearchParamValue>;

export function parseUnitSearchParams(params: UnitSearchParams): UnitViewQuery {
  return {
    archiveState: parseUnitArchiveState(params.archiveState),
    leaseStatus: parseLeaseStatus(params.leaseStatus),
    occupancy: parseOccupancy(params.occupancy),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    query: getTrimmedSearchParam(params.query),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
}

function parseLeaseStatus(
  value: string | string[] | undefined,
): UnitLeaseStatusFilter {
  return getFirstSearchParam(value) === "missing" ? "missing" : "all";
}

function parseOccupancy(
  value: string | string[] | undefined,
): UnitOccupancyFilter {
  return getFirstSearchParam(value) === "unoccupied" ? "unoccupied" : "all";
}

export function parseUnitArchiveState(
  value: string | string[] | undefined,
): UnitArchiveState {
  const archiveState = getFirstSearchParam(value);

  if (archiveState === "archived" || archiveState === "all") {
    return archiveState;
  }

  return DEFAULT_UNIT_ARCHIVE_STATE;
}

function parseStatus(value: string | string[] | undefined): UnitStatusFilter {
  const candidate = getFirstSearchParam(value);

  return candidate === "occupied" ||
    candidate === "vacant" ||
    candidate === "reserved" ||
    candidate === "maintenance" ||
    candidate === "inactive"
    ? candidate
    : "all";
}

function parseSort(value: string | string[] | undefined): UnitSortKey {
  const candidate = getFirstSearchParam(value);

  return candidate === "unit_asc" ||
    candidate === "status_asc" ||
    candidate === "rent_desc" ||
    candidate === "net_desc"
    ? candidate
    : DEFAULT_UNIT_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = getPositiveIntegerSearchParam(value, DEFAULT_UNIT_PAGE_SIZE);

  return UNIT_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof UNIT_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_UNIT_PAGE_SIZE;
}
