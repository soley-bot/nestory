import type {
  TimelineArchiveState,
  TimelineEvent,
  TimelineEventType,
  TimelinePagination,
  TimelineSortKey,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";
import { normalizePageSize } from "@/lib/query/screen-query";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

export const DEFAULT_TIMELINE_PAGE_SIZE = 50;
export const TIMELINE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_TIMELINE_SORT: TimelineSortKey = "date_desc";

const TIMELINE_EVENT_TYPE_VALUES: readonly TimelineEventType[] = [
  "Lease Started",
  "Lease Ended",
  "Tenant Move In",
  "Tenant Move Out",
  "Rent Increase",
  "Maintenance",
  "Repair",
  "Renovation",
  "Inspection",
  "Document Added",
  "General Note",
];
export type TimelineFilterInput = {
  archiveState?: TimelineArchiveState;
  eventType: string;
  propertyId: string;
  query: string;
  unitId?: string;
};

type TimelineSearchParams = Record<string, SearchParamValue>;
type TimelineSearchParamUpdate = Record<string, string | number | null | undefined>;

export function filterTimelineEvents(
  events: TimelineEvent[],
  filters: TimelineFilterInput,
) {
  const queryTokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return events.filter((event) => {
    const matchesEventType =
      filters.eventType === "all" || event.eventType === filters.eventType;
    const matchesProperty =
      filters.propertyId === "all" || event.propertyId === filters.propertyId;
    const matchesUnit =
      !filters.unitId || filters.unitId === "all" || event.unitId === filters.unitId;
    const archiveState = filters.archiveState ?? "active";
    const matchesArchiveState =
      archiveState === "all" ||
      (archiveState === "archived"
        ? Boolean(event.archivedAt)
        : !event.archivedAt);
    const searchable = [
      event.title,
      event.description,
      event.propertyName,
      event.propertyCode,
      event.unitNumber,
      event.relatedDocument,
      event.relatedLease,
      event.relatedLedgerEntry,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      matchesEventType &&
      matchesProperty &&
      matchesUnit &&
      matchesArchiveState &&
      (queryTokens.length === 0 ||
        queryTokens.every((token) => searchable.includes(token)))
    );
  });
}

export function parseTimelineSearchParams(
  params: TimelineSearchParams,
): TimelineViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    eventType: parseEventType(params.eventType),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    query: getTrimmedSearchParam(params.query),
    sort: parseSort(params.sort),
    unitId: getUuidOrAllSearchParam(params.unitId),
  };
}

export function sortTimelineEvents(
  events: TimelineEvent[],
  sort: TimelineSortKey,
) {
  return [...events].sort((left, right) => {
    if (sort === "date_asc") {
      return compareDate(left.eventDate, right.eventDate);
    }

    if (sort === "type_asc") {
      return (
        left.eventType.localeCompare(right.eventType) ||
        compareDate(right.eventDate, left.eventDate)
      );
    }

    if (sort === "property_asc") {
      return (
        left.propertyCode.localeCompare(right.propertyCode) ||
        (left.unitNumber ?? "").localeCompare(right.unitNumber ?? "") ||
        compareDate(right.eventDate, left.eventDate)
      );
    }

    return compareDate(right.eventDate, left.eventDate);
  });
}

export function paginateTimelineEvents(
  events: TimelineEvent[],
  query: Pick<TimelineViewQuery, "page" | "pageSize">,
) {
  const totalCount = events.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
  const page = Math.min(Math.max(query.page, 1), totalPages);
  const fromIndex = (page - 1) * query.pageSize;
  const toIndex = fromIndex + query.pageSize;

  return {
    events: events.slice(fromIndex, toIndex),
    pagination: buildTimelinePagination({
      page,
      pageSize: query.pageSize,
      totalCount,
    }),
  };
}

export function buildTimelinePagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): TimelinePagination {
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

export function buildTimelineSearchString(
  currentSearch: string | URLSearchParams,
  updates: TimelineSearchParamUpdate,
) {
  const params = new URLSearchParams(currentSearch);

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
      continue;
    }

    params.set(key, String(value));
  }

  stripDefaultTimelineParams(params);

  const queryString = params.toString();

  return queryString ? `?${queryString}` : "";
}

function parseArchiveState(
  value: string | string[] | undefined,
): TimelineArchiveState {
  const candidate = getFirstSearchParam(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parseEventType(value: string | string[] | undefined): TimelineEventType | "all" {
  const candidate = getFirstSearchParam(value);

  return candidate && TIMELINE_EVENT_TYPE_VALUES.includes(candidate as TimelineEventType)
    ? (candidate as TimelineEventType)
    : "all";
}

function parseSort(value: string | string[] | undefined): TimelineSortKey {
  const candidate = getFirstSearchParam(value);

  return candidate === "date_asc" ||
    candidate === "type_asc" ||
    candidate === "property_asc"
    ? candidate
    : DEFAULT_TIMELINE_SORT;
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = normalizePageSize(parseOptionalInteger(value));

  return TIMELINE_PAGE_SIZE_OPTIONS.includes(
    candidate as (typeof TIMELINE_PAGE_SIZE_OPTIONS)[number],
  )
    ? candidate
    : DEFAULT_TIMELINE_PAGE_SIZE;
}

function parseOptionalInteger(value: string | string[] | undefined) {
  const parsed = Number.parseInt(getFirstSearchParam(value) ?? "", 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function compareDate(left: string, right: string) {
  return left.localeCompare(right);
}

function stripDefaultTimelineParams(params: URLSearchParams) {
  if (params.get("archiveState") === "active") {
    params.delete("archiveState");
  }

  if (params.get("eventType") === "all") {
    params.delete("eventType");
  }

  if (params.get("propertyId") === "all") {
    params.delete("propertyId");
  }

  if (params.get("unitId") === "all") {
    params.delete("unitId");
  }

  if (params.get("page") === "1") {
    params.delete("page");
  }

  if (params.get("pageSize") === String(DEFAULT_TIMELINE_PAGE_SIZE)) {
    params.delete("pageSize");
  }

  if (params.get("sort") === DEFAULT_TIMELINE_SORT) {
    params.delete("sort");
  }
}
