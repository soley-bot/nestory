import { renderMaintenanceRoute } from "@/features/maintenance/maintenance-route";

type WorkOrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function WorkOrdersPage({ searchParams }: WorkOrdersPageProps) {
  return renderMaintenanceRoute({
    baseReview: "work_orders",
    createButtonLabel: "New work order",
    defaults: { review: "work_orders" },
    description: "Assigned and scheduled maintenance jobs that need follow-through.",
    emptyLabel: "No work orders found.",
    flowLabel: "Execution queue",
    listLabel: "work orders",
    recordLabel: "work order",
    searchParams,
    surfaceVariant: "board",
    title: "Work Orders",
  });
}
