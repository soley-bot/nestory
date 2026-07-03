import { renderMaintenanceRoute } from "@/features/maintenance/maintenance-route";

type RecurringTasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function RecurringTasksPage({
  searchParams,
}: RecurringTasksPageProps) {
  return renderMaintenanceRoute({
    baseReview: "recurring",
    createButtonLabel: "New template",
    defaults: { review: "recurring" },
    description: "Repeated AC cleaning, pest control, inspection, and service routines.",
    emptyLabel: "No recurring maintenance found.",
    flowLabel: "Preventive maintenance",
    listLabel: "templates",
    recordLabel: "template",
    searchParams,
    surfaceVariant: "routine",
    title: "Templates",
  });
}
