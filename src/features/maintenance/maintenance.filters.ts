import type {
  MaintenanceArchiveState,
  MaintenancePriority,
  MaintenanceReviewFilter,
  MaintenanceScope,
  MaintenanceSortKey,
  MaintenanceStatus,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

type MaintenanceSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_MAINTENANCE_PAGE_SIZE = 25;
export const DEFAULT_MAINTENANCE_SORT: MaintenanceSortKey = "due_asc";

export function parseMaintenanceSearchParams(
  params: MaintenanceSearchParams,
): MaintenanceViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    month: parseMonth(params.month),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    priority: parsePriority(params.priority),
    propertyId: parseUuidFilter(params.propertyId),
    query: getFirstValue(params.query)?.trim() ?? "",
    review: parseReview(params.review),
    scope: parseScope(params.scope),
    sort: parseSort(params.sort),
    status: parseStatus(params.status),
    taskId: parseUuidFilter(params.taskId),
    unitId: parseUuidFilter(params.unitId),
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
  const candidate = getFirstValue(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parsePriority(
  value: string | string[] | undefined,
): MaintenancePriority | "all" {
  const candidate = getFirstValue(value);

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
  const candidate = getFirstValue(value);

  return candidate === "open" ||
    candidate === "overdue" ||
    candidate === "upcoming" ||
    candidate === "reminders" ||
    candidate === "high_priority" ||
    candidate === "high_cost" ||
    candidate === "recurring" ||
    candidate === "completed"
    ? candidate
    : "open";
}

function parseSort(value: string | string[] | undefined): MaintenanceSortKey {
  const candidate = getFirstValue(value);

  return candidate === "priority_desc" ||
    candidate === "cost_desc" ||
    candidate === "created_desc"
    ? candidate
    : DEFAULT_MAINTENANCE_SORT;
}

function parseScope(value: string | string[] | undefined): MaintenanceScope {
  return getFirstValue(value) === "all" ? "all" : "focused";
}

function parseStatus(
  value: string | string[] | undefined,
): MaintenanceStatus | "all" {
  const candidate = getFirstValue(value);

  return candidate === "pending" ||
    candidate === "scheduled" ||
    candidate === "in_progress" ||
    candidate === "blocked" ||
    candidate === "completed" ||
    candidate === "cancelled"
    ? candidate
    : "all";
}

function parseUuidFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && uuidPattern.test(candidate) ? candidate : "all";
}

function parseMonth(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && monthPattern.test(candidate) ? candidate : getCurrentMonthValue();
}

function parsePageSize(value: string | string[] | undefined) {
  const parsed = parsePositiveInteger(value, DEFAULT_MAINTENANCE_PAGE_SIZE);

  return [10, 25, 50, 100].includes(parsed)
    ? parsed
    : DEFAULT_MAINTENANCE_PAGE_SIZE;
}

function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
) {
  const parsed = Number.parseInt(getFirstValue(value) ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getCurrentMonthValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
