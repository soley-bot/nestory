import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { requireWorkspaceContext } from "@/lib/auth/context";

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
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
      createButtonLabel="New task"
      description={
        context.role === "member"
          ? "Assigned work, due dates, checklists, and current status."
          : "Assign branch work, track staff load, and keep task follow-through visible."
      }
      emptyLabel={
        context.role === "member"
          ? "No assigned tasks found."
          : "No tasks found."
      }
      initialTaskId={initialTaskId}
      pagination={data.pagination}
      peopleOptions={data.peopleOptions}
      propertyOptions={data.propertyOptions}
      showReportAction={false}
      staffOptions={data.staffOptions}
      summary={data.summary}
      title="Tasks"
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}
