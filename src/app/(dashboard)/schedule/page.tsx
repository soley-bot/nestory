import { renderMaintenanceRoute } from "@/features/maintenance/maintenance-route";

type SchedulePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SchedulePage({ searchParams }: SchedulePageProps) {
  return renderMaintenanceRoute({
    baseReview: "scheduled",
    createButtonLabel: "New scheduled case",
    defaults: { pageSize: "100", review: "scheduled", sort: "due_asc" },
    description: "Scheduled maintenance visits, due dates, inspections, and service windows.",
    emptyLabel: "No scheduled maintenance found.",
    flowLabel: "Calendar queue",
    listLabel: "scheduled work",
    recordLabel: "scheduled item",
    searchParams,
    showFilters: false,
    showScopeSummary: false,
    surfaceVariant: "agenda",
    title: "Calendar",
  });
}
