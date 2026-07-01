import type {
  MaintenanceArchiveState,
  MaintenancePriority,
  MaintenanceReviewFilter,
  MaintenanceScope,
  MaintenanceSortKey,
  MaintenanceStatus,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";
import { getBusinessMonthValue } from "@/lib/dates/business-date";

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

type MaintenanceSearchParams = Record<string, SearchParamValue>;

export const DEFAULT_MAINTENANCE_PAGE_SIZE = 25;
export const DEFAULT_MAINTENANCE_SORT: MaintenanceSortKey = "due_asc";

export function parseMaintenanceSearchParams(
  params: MaintenanceSearchParams,
): MaintenanceViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    month: parseMonth(params.month),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    priority: parsePriority(params.priority),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    query: getTrimmedSearchParam(params.query),
    review: parseReview(params.review),
    scope: parseScope(params.scope),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
    taskId: getUuidOrAllSearchParam(params.taskId),
    unitId: getUuidOrAllSearchParam(params.unitId),
  };
}

export function buildMaintenancePagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}) {
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
): MaintenanceArchiveState {
  const candidate = getFirstSearchParam(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parsePriority(
  value: string | string[] | undefined,
): MaintenancePriority | "all" {
  const candidate = getFirstSearchParam(value);

  return candidate === "low" ||
    candidate === "normal" ||
    candidate === "high" ||
    candidate === "urgent"
    ? candidate
    : "all";
}

function parseReview(
  value: string | string[] | undefined,
): MaintenanceReviewFilter {
  const candidate = getFirstSearchParam(value);

  return candidate === "open" ||
    candidate === "overdue" ||
    candidate === "scheduled" ||
    candidate === "upcoming" ||
    candidate === "reminders" ||
    candidate === "work_orders" ||
    candidate === "inspections" ||
    candidate === "high_priority" ||
    candidate === "high_cost" ||
    candidate === "recurring" ||
    candidate === "completed"
    ? candidate
    : "open";
}

function parseSort(value: string | string[] | undefined): MaintenanceSortKey {
  const candidate = getFirstSearchParam(value);

  return candidate === "priority_desc" ||
    candidate === "cost_desc" ||
    candidate === "created_desc"
    ? candidate
    : DEFAULT_MAINTENANCE_SORT;
}

function parseScope(value: string | string[] | undefined): MaintenanceScope {
  return getFirstSearchParam(value) === "all" ? "all" : "focused";
}

function parseStatus(
  value: string | string[] | undefined,
): MaintenanceStatus | "all" {
  const candidate = getFirstSearchParam(value);

  return candidate === "pending" ||
    candidate === "scheduled" ||
    candidate === "in_progress" ||
    candidate === "blocked" ||
    candidate === "completed" ||
    candidate === "cancelled"
    ? candidate
    : "all";
}

function parseMonth(value: string | string[] | undefined) {
  const candidate = getFirstSearchParam(value);

  return candidate && monthPattern.test(candidate) ? candidate : getCurrentMonthValue();
}

function parsePageSize(value: string | string[] | undefined) {
  const parsed = getPositiveIntegerSearchParam(
    value,
    DEFAULT_MAINTENANCE_PAGE_SIZE,
  );

  return [10, 25, 50, 100].includes(parsed)
    ? parsed
    : DEFAULT_MAINTENANCE_PAGE_SIZE;
}

function getCurrentMonthValue() {
  return getBusinessMonthValue();
}
