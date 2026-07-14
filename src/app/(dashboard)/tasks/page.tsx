import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import {
  getMaintenanceReminderNotifications,
  getMaintenanceScreenData,
} from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { requireWorkspaceContext } from "@/lib/auth/context";

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);

  if (context.role === "member" && !context.personId) {
    return <UnlinkedMemberTasksState />;
  }

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
      actor={actor}
      baseReview="all"
      branchOptions={data.branchOptions}
      capabilities={capabilities}
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
      propertyOptions={data.propertyOptions}
      recordLabel="task"
      reminders={reminders}
      showReportAction={false}
      staffOptions={data.staffOptions}
      summary={data.summary}
      surfaceVariant="board"
      title="Tasks"
      unitOptions={data.unitOptions}
      vendorOptions={data.vendorOptions}
      viewQuery={viewQuery}
    />
  );
}

function UnlinkedMemberTasksState() {
  return (
    <div className="min-h-screen">
      <PageHeader
        description="Your login is active, but it is not connected to a staff record yet."
        title="Tasks"
      />
      <main className="px-4 py-4 sm:px-6 lg:px-6">
        <section className="max-w-2xl rounded-md border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Staff profile link required</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ask an administrator to link your login to your staff profile before
            assigned maintenance work can appear here.
          </p>
          <Link
            className="mt-4 inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted"
            href="/account"
          >
            Open profile
          </Link>
        </section>
      </main>
    </div>
  );
}
