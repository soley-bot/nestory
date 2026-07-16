import { renderTimelineRoute } from "@/features/timeline/timeline-route";

type TimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({
  searchParams,
}: TimelinePageProps) {
  return renderTimelineRoute({
    scope: "global",
    searchParams,
    title: "Timeline History",
  });
}
