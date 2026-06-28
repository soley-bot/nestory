import type {
  PropertyArchiveState,
  PropertyNetStatusFilter,
  PropertyOwnerStatusFilter,
  PropertySortKey,
  PropertyViewQuery,
} from "@/features/properties/property.types";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

export const DEFAULT_PROPERTY_PAGE_SIZE = 50;
export const PROPERTY_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PROPERTY_SORT: PropertySortKey = "code_asc";

type PropertySearchParams = Record<string, SearchParamValue>;

const PROPERTY_STATUS_VALUES = ["active", "under_renovation", "inactive"] as const;

export function parsePropertySearchParams(
  params: PropertySearchParams,
): PropertyViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    netStatus: parseNetStatus(params.netStatus),
    ownerStatus: parseOwnerStatus(params.ownerStatus),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    query: getTrimmedSearchParam(params.query),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
}

function parseNetStatus(
  value: string | string[] | undefined,
): PropertyNetStatusFilter {
  return getFirstSearchParam(value) === "negative" ? "negative" : "all";
}

function parseOwnerStatus(
  value: string | string[] | undefined,
): PropertyOwnerStatusFilter {
  return getFirstSearchParam(value) === "missing" ? "missing" : "all";
}

function parseArchiveState(
  value: string | string[] | undefined,
): PropertyArchiveState {
  const candidate = getFirstSearchParam(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parseStatus(value: string | string[] | undefined) {
  const candidate = getFirstSearchParam(value);

  return PROPERTY_STATUS_VALUES.includes(
    candidate as (typeof PROPERTY_STATUS_VALUES)[number],
  )
    ? (candidate as (typeof PROPERTY_STATUS_VALUES)[number])
    : "all";
}

function parseSort(value: string | string[] | undefined): PropertySortKey {
  const candidate = getFirstSearchParam(value);

  return candidate === "name_asc" ||
    candidate === "status_asc" ||
    candidate === "net_asc" ||
    candidate === "net_desc"
    ? candidate
    : DEFAULT_PROPERTY_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = getPositiveIntegerSearchParam(value, DEFAULT_PROPERTY_PAGE_SIZE);

  return PROPERTY_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof PROPERTY_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_PROPERTY_PAGE_SIZE;
}
