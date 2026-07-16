import { renderTimelineRoute } from "@/features/timeline/timeline-route";

type PropertyTimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertyTimelinePage({
  searchParams,
}: PropertyTimelinePageProps) {
  return renderTimelineRoute({
    scope: "property",
    searchParams,
    title: "Property Timeline",
  });
}
