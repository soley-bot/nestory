import { renderTimelineRoute } from "@/features/timeline/timeline-route";

type MaintenanceTimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenanceTimelinePage({
  searchParams,
}: MaintenanceTimelinePageProps) {
  return renderTimelineRoute({
    description:
      "Track maintenance, repairs, renovations, and inspections across the portfolio.",
    scope: "maintenance",
    searchParams,
    title: "Maintenance Timeline",
  });
}
