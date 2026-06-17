import { TimelineScreen } from "@/features/timeline/components/timeline-screen";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { parseTimelineSearchParams } from "@/features/timeline/timeline.filters";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type TimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const data = await getTimelineScreenData(
    context.organizationId,
    parseTimelineSearchParams(params),
  );

  return (
    <TimelineScreen {...data} initialEventId={getUuidSearchParam(params.eventId)} />
  );
}
