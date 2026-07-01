import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import {
  getMaintenanceReminderNotifications,
  getMaintenanceScreenData,
} from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { requireWorkspaceContext } from "@/lib/auth/context";

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const context = await requireWorkspaceContext();
  const params = await searchParams;
  const viewQuery = parseMaintenanceSearchParams({ review: "all", ...params });
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
      baseReview="all"
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
      flowLabel="Assignment queue"
      initialTaskId={initialTaskId}
      listLabel="tasks"
      pagination={data.pagination}
      peopleOptions={data.peopleOptions}
      propertyOptions={data.propertyOptions}
      recordLabel="task"
      reminders={reminders}
      showReportAction={false}
      staffOptions={data.staffOptions}
      summary={data.summary}
      surfaceVariant="board"
      title="Tasks"
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}
