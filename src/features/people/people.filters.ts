import type {
  PeopleArchiveState,
  PeopleRoleFilter,
  PeopleSortKey,
  PeopleStatusFilter,
  PeopleViewQuery,
} from "@/features/people/people.types";

export const DEFAULT_PEOPLE_ARCHIVE_STATE: PeopleArchiveState = "active";
export const DEFAULT_PEOPLE_PAGE_SIZE = 50;
export const PEOPLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PEOPLE_SORT: PeopleSortKey = "name_asc";

type PeopleSearchParams = Record<string, string | string[] | undefined>;

export function parsePeopleSearchParams(
  params: PeopleSearchParams,
): PeopleViewQuery {
  return {
    archiveState: parsePeopleArchiveState(params.archiveState),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    role: parseRole(params.role),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
  };
}

export function parsePeopleArchiveState(
  value: string | string[] | undefined,
): PeopleArchiveState {
  const archiveState = getFirstValue(value);

  if (archiveState === "archived" || archiveState === "all") {
    return archiveState;
  }

  return DEFAULT_PEOPLE_ARCHIVE_STATE;
}

function parseRole(value: string | string[] | undefined): PeopleRoleFilter {
  const candidate = getFirstValue(value);

  return candidate === "tenant" ||
    candidate === "owner" ||
    candidate === "vendor"
    ? candidate
    : "all";
}

function parseStatus(value: string | string[] | undefined): PeopleStatusFilter {
  const candidate = getFirstValue(value);

  return candidate === "active" ||
    candidate === "inactive" ||
    candidate === "missing_contact" ||
    candidate === "no_role"
    ? candidate
    : "all";
}

function parseSort(value: string | string[] | undefined): PeopleSortKey {
  const candidate = getFirstValue(value);

  return candidate === "role_asc" ||
    candidate === "linked_desc" ||
    candidate === "updated_desc"
    ? candidate
    : DEFAULT_PEOPLE_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = parsePositiveInteger(value, DEFAULT_PEOPLE_PAGE_SIZE);

  return PEOPLE_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof PEOPLE_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_PEOPLE_PAGE_SIZE;
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
