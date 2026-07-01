import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { requireWorkspaceContext } from "@/lib/auth/context";

type MaintenancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  const context = await requireWorkspaceContext();
  const params = await searchParams;
  const viewQuery = parseMaintenanceSearchParams(params);
  const data = await getMaintenanceScreenData(context.organizationId, viewQuery, {
    branchId: context.branchId,
    personId: context.personId,
    role: context.role,
  });
  const initialTaskId = viewQuery.taskId === "all" ? undefined : viewQuery.taskId;

  return (
    <MaintenanceScreen
      branchOptions={data.branchOptions}
      canManageTasks={context.role !== "member"}
      cases={data.cases}
      createButtonLabel="New request"
      description="New maintenance requests and open issues waiting for triage."
      emptyLabel="No requests found."
      flowLabel="Intake queue"
      initialTaskId={initialTaskId}
      listLabel="requests"
      pagination={data.pagination}
      peopleOptions={data.peopleOptions}
      propertyOptions={data.propertyOptions}
      recordLabel="request"
      staffOptions={data.staffOptions}
      summary={data.summary}
      surfaceVariant="inbox"
      title="Requests"
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}
