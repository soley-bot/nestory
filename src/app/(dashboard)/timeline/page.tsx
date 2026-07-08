import { renderTimelineRoute } from "@/features/timeline/timeline-route";

type TimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({
  searchParams,
}: TimelinePageProps) {
  return renderTimelineRoute({
    description:
      "Search, filter, and inspect the full historical record across properties and units.",
    scope: "global",
    searchParams,
    title: "Timeline History",
  });
}
