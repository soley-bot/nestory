import { renderMaintenanceRoute } from "@/features/maintenance/maintenance-route";

type RecurringTasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function RecurringTasksPage({
  searchParams,
}: RecurringTasksPageProps) {
  return renderMaintenanceRoute({
    baseReview: "recurring",
    createButtonLabel: "New recurring task",
    defaults: { review: "recurring" },
    description: "Repeated AC cleaning, pest control, inspection, and service routines.",
    emptyLabel: "No recurring maintenance found.",
    flowLabel: "Preventive maintenance",
    listLabel: "recurring tasks",
    recordLabel: "recurring task",
    searchParams,
    surfaceVariant: "routine",
    title: "Recurring Tasks",
  });
}
