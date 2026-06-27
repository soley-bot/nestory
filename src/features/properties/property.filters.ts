import type {
  PropertyArchiveState,
  PropertyOwnerStatusFilter,
  PropertySortKey,
  PropertyViewQuery,
} from "@/features/properties/property.types";

export const DEFAULT_PROPERTY_PAGE_SIZE = 50;
export const PROPERTY_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PROPERTY_SORT: PropertySortKey = "code_asc";

type PropertySearchParams = Record<string, string | string[] | undefined>;

const PROPERTY_STATUS_VALUES = ["active", "under_renovation", "inactive"] as const;

export function parsePropertySearchParams(
  params: PropertySearchParams,
): PropertyViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    ownerStatus: parseOwnerStatus(params.ownerStatus),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
}

function parseOwnerStatus(
  value: string | string[] | undefined,
): PropertyOwnerStatusFilter {
  return getFirstValue(value) === "missing" ? "missing" : "all";
}

function parseArchiveState(
  value: string | string[] | undefined,
): PropertyArchiveState {
  const candidate = getFirstValue(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parseStatus(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return PROPERTY_STATUS_VALUES.includes(
    candidate as (typeof PROPERTY_STATUS_VALUES)[number],
  )
    ? (candidate as (typeof PROPERTY_STATUS_VALUES)[number])
    : "all";
}

function parseSort(value: string | string[] | undefined): PropertySortKey {
  const candidate = getFirstValue(value);

  return candidate === "name_asc" ||
    candidate === "status_asc" ||
    candidate === "net_desc"
    ? candidate
    : DEFAULT_PROPERTY_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = parsePositiveInteger(value, DEFAULT_PROPERTY_PAGE_SIZE);

  return PROPERTY_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof PROPERTY_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_PROPERTY_PAGE_SIZE;
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
