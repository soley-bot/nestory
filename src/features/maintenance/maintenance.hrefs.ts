import type { MaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import type {
  MaintenanceActor,
  MaintenanceCaseHrefs,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import {
  DEFAULT_MAINTENANCE_PAGE_SIZE,
  DEFAULT_MAINTENANCE_SORT,
} from "@/features/maintenance/maintenance.filters";
import { buildUnitRecordHref } from "@/features/units/unit-detail-route";
import { buildHref } from "@/lib/url/href";

export type MaintenanceHrefTask = {
  assignee_person_id: string | null;
  id: string;
  ledger_entry_id: string | null;
  property_id: string;
  timeline_event_id: string | null;
  unit_id: string | null;
  vendor_person_id: string | null;
};

type MaintenanceHrefAccess =
  | Pick<MaintenanceActor, "role">
  | Pick<MaintenanceCapabilities, "canUploadMaintenanceEvidence">;

export function buildMaintenanceHrefs(
  task: MaintenanceHrefTask,
  access: MaintenanceHrefAccess,
): MaintenanceCaseHrefs {
  const taskHref = buildHref("/maintenance", {
    archiveState: "all",
    taskId: task.id,
  });
  const hasAdminRecordAccess = "role" in access
    ? access.role === "admin"
    : access.canUploadMaintenanceEvidence;

  if (!hasAdminRecordAccess) {
    return { task: taskHref };
  }

  return {
    assignee: task.assignee_person_id
      ? buildHref("/people", {
          archiveState: "all",
          personId: task.assignee_person_id,
        })
      : undefined,
    documents: `/documents?archiveState=all&taskId=${task.id}`,
    documentUpload: buildHref("/documents", {
      action: "create",
      category: "Maintenance",
      propertyId: task.property_id,
      taskId: task.id,
      unitId: task.unit_id ?? undefined,
    }),
    ledger: task.ledger_entry_id
      ? buildHref("/ledger", {
          archiveState: "all",
          entryId: task.ledger_entry_id,
        })
      : undefined,
    property: `/properties/${task.property_id}`,
    task: taskHref,
    timeline: task.timeline_event_id
      ? buildHref("/timeline", {
          archiveState: "all",
          eventId: task.timeline_event_id,
        })
      : undefined,
    unit: task.unit_id
      ? buildUnitRecordHref({
          section: "maintenance",
          sourceTaskId: task.id,
          unitId: task.unit_id,
        })
      : undefined,
    vendor: task.vendor_person_id
      ? buildHref("/people", {
          archiveState: "all",
          personId: task.vendor_person_id,
        })
      : undefined,
  };
}

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
  if (next.view !== "inbox") params.set("view", next.view);

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

export function buildMaintenanceSavedViewHref(
  pathname: string,
  searchParams: { toString(): string },
  review: MaintenanceViewQuery["review"],
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  nextParams.set("view", "list");
  nextParams.delete("page");
  nextParams.delete("pageSize");
  nextParams.delete("sort");
  nextParams.delete("status");
  nextParams.delete("taskId");

  if (review === "open") {
    nextParams.delete("review");
  } else {
    nextParams.set("review", review);
  }

  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function buildMaintenanceCasesViewHref(
  pathname: string,
  searchParams: { toString(): string },
  view: MaintenanceViewQuery["view"],
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  nextParams.delete("page");
  nextParams.delete("taskId");
  nextParams.delete("status");

  if (view === "inbox") {
    nextParams.delete("view");
    nextParams.delete("review");
    nextParams.delete("pageSize");
    nextParams.delete("sort");
  } else {
    nextParams.set("view", view);
  }

  if (view === "board") {
    nextParams.set("review", "work_orders");
    nextParams.delete("pageSize");
    nextParams.delete("sort");
  } else if (view === "calendar") {
    nextParams.set("review", "scheduled");
    nextParams.set("pageSize", "100");
    nextParams.set("sort", "due_asc");
  } else if (view === "templates") {
    nextParams.set("review", "recurring");
    nextParams.delete("pageSize");
    nextParams.delete("sort");
  } else if (view === "list") {
    nextParams.delete("review");
    nextParams.delete("pageSize");
    nextParams.delete("sort");
  }

  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function buildMaintenanceTabHref(
  pathname: string,
  searchParams: { toString(): string },
  review: MaintenanceViewQuery["review"],
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  if (review === "open") {
    nextParams.delete("review");
  } else {
    nextParams.set("review", review);
  }

  nextParams.delete("page");
  nextParams.delete("status");
  nextParams.delete("taskId");
  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function buildClearFiltersHref(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  [
    "archiveState",
    "month",
    "page",
    "priority",
    "propertyId",
    "query",
    "review",
    "scope",
    "sort",
    "status",
    "taskId",
    "unitId",
  ].forEach((key) => nextParams.delete(key));

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
