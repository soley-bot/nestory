import type {
  PeopleArchiveState,
  PeopleRoleFilter,
  PeopleSortKey,
  PeopleStatusFilter,
  PeopleViewQuery,
} from "@/features/people/people.types";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

export const DEFAULT_PEOPLE_ARCHIVE_STATE: PeopleArchiveState = "active";
export const DEFAULT_PEOPLE_PAGE_SIZE = 50;
export const PEOPLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PEOPLE_SORT: PeopleSortKey = "name_asc";

type PeopleSearchParams = Record<string, SearchParamValue>;

export function parsePeopleSearchParams(
  params: PeopleSearchParams,
): PeopleViewQuery {
  return {
    archiveState: parsePeopleArchiveState(params.archiveState),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    query: getTrimmedSearchParam(params.query),
    role: parseRole(params.role),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
}

export function parsePeopleArchiveState(
  value: string | string[] | undefined,
): PeopleArchiveState {
  const archiveState = getFirstSearchParam(value);

  if (archiveState === "archived" || archiveState === "all") {
    return archiveState;
  }

  return DEFAULT_PEOPLE_ARCHIVE_STATE;
}

function parseRole(value: string | string[] | undefined): PeopleRoleFilter {
  const candidate = getFirstSearchParam(value);

  return candidate === "tenant" ||
    candidate === "owner" ||
    candidate === "vendor"
    ? candidate
    : "all";
}

function parseStatus(value: string | string[] | undefined): PeopleStatusFilter {
  const candidate = getFirstSearchParam(value);

  return candidate === "active" ||
    candidate === "inactive" ||
    candidate === "missing_contact" ||
    candidate === "no_role"
    ? candidate
    : "all";
}

function parseSort(value: string | string[] | undefined): PeopleSortKey {
  const candidate = getFirstSearchParam(value);

  return candidate === "updated_desc"
    ? candidate
    : DEFAULT_PEOPLE_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = getPositiveIntegerSearchParam(value, DEFAULT_PEOPLE_PAGE_SIZE);

  return PEOPLE_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof PEOPLE_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_PEOPLE_PAGE_SIZE;
}
