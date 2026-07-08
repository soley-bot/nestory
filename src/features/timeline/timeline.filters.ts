import type {
  TimelineArchiveState,
  TimelineEventType,
  TimelinePagination,
  TimelineSortKey,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";
import { normalizePageSize } from "@/lib/query/screen-query";
import {
  getFirstSearchParam,
  getNullableUuidSearchParam,
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
type TimelineSearchParams = Record<string, SearchParamValue>;

export function parseTimelineSearchParams(
  params: TimelineSearchParams,
): TimelineViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    dateFrom: parseDate(params.dateFrom),
    dateTo: parseDate(params.dateTo),
    eventId: getNullableUuidSearchParam(params.eventId),
    eventType: parseEventType(params.eventType),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    query: getTrimmedSearchParam(params.query),
    sort: parseSort(params.sort),
    unitId: getUuidOrAllSearchParam(params.unitId),
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

function parseArchiveState(
  value: string | string[] | undefined,
): TimelineArchiveState {
  const candidate = getFirstSearchParam(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parseEventType(
  value: string | string[] | undefined,
): TimelineEventType | "all" {
  const candidate = getFirstSearchParam(value);

  return candidate &&
    TIMELINE_EVENT_TYPE_VALUES.includes(candidate as TimelineEventType)
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

function parseDate(value: SearchParamValue) {
  const candidate = getFirstSearchParam(value)?.trim() ?? "";

  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
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
