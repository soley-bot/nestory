import { TimelineScreen } from "@/features/timeline/components/timeline-screen";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type TimelinePageProps = {
  searchParams: Promise<{ eventId?: string | string[] }>;
};

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const context = await requireAdminContext();
  const { eventId } = await searchParams;
  const data = await getTimelineScreenData(context.organizationId);

  return <TimelineScreen {...data} initialEventId={getUuidSearchParam(eventId)} />;
}
