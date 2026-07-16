import { TimelineScreen } from "@/features/timeline/components/timeline-screen";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { parseTimelineSearchParams } from "@/features/timeline/timeline.filters";
import type { TimelineScope } from "@/features/timeline/timeline.types";
import { requireAdminContext } from "@/lib/auth/context";

type TimelineRouteProps = {
  scope: TimelineScope;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  title: string;
};

export async function renderTimelineRoute({
  scope,
  searchParams,
  title,
}: TimelineRouteProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parseTimelineSearchParams(params);
  const data = await getTimelineScreenData(context.organizationId, viewQuery, {
    scope,
  });

  return (
    <TimelineScreen
      {...data}
      initialEventId={viewQuery.eventId ?? undefined}
      scope={scope}
      title={title}
    />
  );
}
