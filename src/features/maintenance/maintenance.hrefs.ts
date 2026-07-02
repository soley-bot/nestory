import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";
import {
  DEFAULT_MAINTENANCE_PAGE_SIZE,
  DEFAULT_MAINTENANCE_SORT,
} from "@/features/maintenance/maintenance.filters";

export function getMaintenanceListHref(
  viewQuery: MaintenanceViewQuery,
  overrides: Partial<MaintenanceViewQuery> = {},
) {
  const next = {
    ...viewQuery,
    ...overrides,
    page: overrides.page ?? 1,
  };
  const params = new URLSearchParams();

  params.set("month", next.month);

  if (next.archiveState !== "active") params.set("archiveState", next.archiveState);
  if (next.page !== 1) params.set("page", String(next.page));
  if (next.pageSize !== DEFAULT_MAINTENANCE_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }
  if (next.priority !== "all") params.set("priority", next.priority);
  if (next.propertyId !== "all") params.set("propertyId", next.propertyId);
  if (next.query) params.set("query", next.query);
  if (next.review !== "open") params.set("review", next.review);
  if (next.scope !== "focused") params.set("scope", next.scope);
  if (next.sort !== DEFAULT_MAINTENANCE_SORT) params.set("sort", next.sort);
  if (next.status !== "all") params.set("status", next.status);
  if (next.taskId !== "all") params.set("taskId", next.taskId);
  if (next.unitId !== "all") params.set("unitId", next.unitId);

  const queryString = params.toString();
  return queryString ? `/maintenance?${queryString}` : "/maintenance";
}

export function getMaintenanceReportHref(
  viewQuery: Pick<MaintenanceViewQuery, "month" | "propertyId">,
) {
  const params = new URLSearchParams({
    month: viewQuery.month,
    report: "maintenance-cost",
  });

  if (viewQuery.propertyId !== "all") {
    params.set("propertyId", viewQuery.propertyId);
  }

  return `/reports?${params.toString()}`;
}
