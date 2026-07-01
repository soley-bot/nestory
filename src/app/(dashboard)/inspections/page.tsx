import { renderMaintenanceRoute } from "@/features/maintenance/maintenance-route";

type InspectionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function InspectionsPage({ searchParams }: InspectionsPageProps) {
  return renderMaintenanceRoute({
    baseReview: "inspections",
    createButtonLabel: "New inspection",
    defaults: { review: "inspections" },
    description: "Condition checks, inspection requests, and follow-up work.",
    emptyLabel: "No inspections found.",
    flowLabel: "Inspection queue",
    listLabel: "inspections",
    recordLabel: "inspection",
    searchParams,
    surfaceVariant: "checklist",
    title: "Inspections",
  });
}
