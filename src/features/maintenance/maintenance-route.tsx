import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import type { MaintenanceSurfaceVariant } from "@/features/maintenance/components/maintenance-work-surfaces";
import {
  getMaintenanceReminderNotifications,
  getMaintenanceScreenData,
} from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";
import { requireWorkspaceContext } from "@/lib/auth/context";

type MaintenanceRouteSearchParams = Record<
  string,
  string | string[] | undefined
>;

type MaintenanceRouteOptions = {
  baseReview?: MaintenanceViewQuery["review"];
  createButtonLabel?: string;
  defaults?: Partial<Record<keyof MaintenanceViewQuery, string>>;
  description: string;
  emptyLabel: string;
  flowLabel: string;
  listLabel: string;
  recordLabel: string;
  searchParams: Promise<MaintenanceRouteSearchParams>;
  showFilters?: boolean;
  showReportAction?: boolean;
  showReviewTabs?: boolean;
  showScopeSummary?: boolean;
  surfaceVariant?: MaintenanceSurfaceVariant;
  title: string;
};

export async function renderMaintenanceRoute({
  baseReview,
  createButtonLabel = "New case",
  defaults = {},
  description,
  emptyLabel,
  flowLabel,
  listLabel,
  recordLabel,
  searchParams,
  showFilters = true,
  showReportAction = false,
  showReviewTabs = false,
  showScopeSummary = true,
  surfaceVariant,
  title,
}: MaintenanceRouteOptions) {
  const context = await requireWorkspaceContext();
  const params = applyMaintenanceRouteDefaults(await searchParams, defaults);
  const viewQuery = parseMaintenanceSearchParams(params);
  const actor = {
    branchId: context.branchId,
    personId: context.personId,
    role: context.role,
  };
  const [data, reminders] = await Promise.all([
    getMaintenanceScreenData(context.organizationId, viewQuery, actor),
    getMaintenanceReminderNotifications(context.organizationId, actor),
  ]);
  const initialTaskId = viewQuery.taskId === "all" ? undefined : viewQuery.taskId;

  return (
    <MaintenanceScreen
      baseReview={baseReview}
      branchOptions={data.branchOptions}
      canManageTasks={context.role !== "member"}
      cases={data.cases}
      createButtonLabel={createButtonLabel}
      description={description}
      emptyLabel={emptyLabel}
      flowLabel={flowLabel}
      initialTaskId={initialTaskId}
      listLabel={listLabel}
      pagination={data.pagination}
      peopleOptions={data.peopleOptions}
      propertyOptions={data.propertyOptions}
      recordLabel={recordLabel}
      reminders={reminders}
      showFilters={showFilters}
      showReportAction={showReportAction}
      showReviewTabs={showReviewTabs}
      showScopeSummary={showScopeSummary}
      staffOptions={data.staffOptions}
      summary={data.summary}
      surfaceVariant={surfaceVariant}
      title={title}
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}

function applyMaintenanceRouteDefaults(
  params: MaintenanceRouteSearchParams,
  defaults: Partial<Record<keyof MaintenanceViewQuery, string>>,
) {
  const nextParams: MaintenanceRouteSearchParams = { ...params };

  for (const [key, value] of Object.entries(defaults)) {
    if (nextParams[key] === undefined) {
      nextParams[key] = value;
    }
  }

  return nextParams;
}
