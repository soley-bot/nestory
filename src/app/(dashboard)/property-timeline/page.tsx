import { renderTimelineRoute } from "@/features/timeline/timeline-route";

type PropertyTimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertyTimelinePage({
  searchParams,
}: PropertyTimelinePageProps) {
  return renderTimelineRoute({
    description:
      "Review property and unit history with property-first filters and evidence.",
    scope: "property",
    searchParams,
    title: "Property Timeline",
  });
}
