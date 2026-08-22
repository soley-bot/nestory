import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import type { MaintenanceSurfaceVariant } from "@/features/maintenance/components/maintenance-work-surfaces";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";
import { requirePermission } from "@/lib/auth/context";

type MaintenancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  const context = await requirePermission("maintenance.view");
  const capabilities = getMaintenanceCapabilities(context);

  const params = await searchParams;
  const viewQuery = normalizeCasesViewQuery(parseMaintenanceSearchParams(params));
  const routeConfig = getCasesRouteConfig(viewQuery);
  const data = await getMaintenanceScreenData(context.organizationId, viewQuery, {
    branchId: context.branchId,
    dataScope: context.isSuperAdmin ? "organization" : "branch",
    personId: context.personId,
    workflowMode: "coordinator",
  });
  const initialTaskId = viewQuery.taskId === "all" ? undefined : viewQuery.taskId;

  return (
    <MaintenanceScreen
      actor={{
        branchId: context.branchId,
        dataScope: context.isSuperAdmin ? "organization" : "branch",
        personId: context.personId,
        workflowMode: "coordinator",
      }}
      branchOptions={data.branchOptions}
      capabilities={capabilities}
      cases={data.cases}
      createButtonLabel="New case"
      emptyLabel={routeConfig.emptyLabel}
      flowLabel={routeConfig.flowLabel}
      initialTaskId={initialTaskId}
      listLabel="cases"
      pagination={data.pagination}
      propertyOptions={data.propertyOptions}
      recordLabel="case"
      staffOptions={data.staffOptions}
      showCaseViewTabs
      showReviewTabs={routeConfig.showReviewTabs}
      showScopeSummary={routeConfig.showScopeSummary}
      summary={data.summary}
      surfaceVariant={routeConfig.surfaceVariant}
      title="Cases"
      unitOptions={data.unitOptions}
      vendorOptions={data.vendorOptions}
      viewQuery={viewQuery}
    />
  );
}

function normalizeCasesViewQuery(
  viewQuery: MaintenanceViewQuery,
): MaintenanceViewQuery {
  if (viewQuery.view === "inbox") {
    return { ...viewQuery, view: "list" };
  }

  if (viewQuery.view === "board" && viewQuery.review === "open") {
    return { ...viewQuery, review: "work_orders" };
  }

  if (viewQuery.view === "calendar" && viewQuery.review === "open") {
    return {
      ...viewQuery,
      pageSize: 100,
      review: "scheduled",
      sort: "due_asc",
    };
  }

  if (viewQuery.view === "templates" && viewQuery.review === "open") {
    return { ...viewQuery, review: "recurring" };
  }

  return viewQuery;
}

function getCasesRouteConfig(viewQuery: MaintenanceViewQuery): {
  emptyLabel: string;
  flowLabel: string;
  showReviewTabs: boolean;
  showScopeSummary: boolean;
  surfaceVariant: MaintenanceSurfaceVariant;
} {
  if (viewQuery.view === "list") {
    return {
      emptyLabel: "No maintenance cases found.",
      flowLabel: "Work queue",
      showReviewTabs: false,
      showScopeSummary: false,
      surfaceVariant: "table",
    };
  }

  if (viewQuery.view === "board") {
    return {
      emptyLabel: "No work orders found.",
      flowLabel: "Execution queue",
      showReviewTabs: true,
      showScopeSummary: true,
      surfaceVariant: "board",
    };
  }

  if (viewQuery.view === "calendar") {
    return {
      emptyLabel: "No scheduled maintenance found.",
      flowLabel: "Calendar queue",
      showReviewTabs: false,
      showScopeSummary: false,
      surfaceVariant: "agenda",
    };
  }

  if (viewQuery.view === "templates") {
    return {
      emptyLabel: "No recurring maintenance found.",
      flowLabel: "Preventive maintenance",
      showReviewTabs: true,
      showScopeSummary: true,
      surfaceVariant: "routine",
    };
  }

  return {
    emptyLabel: "No maintenance cases found.",
    flowLabel: "Work queue",
    showReviewTabs: false,
    showScopeSummary: false,
    surfaceVariant: "table",
  };
}
