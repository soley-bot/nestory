import { TimelineScreen } from "@/features/timeline/components/timeline-screen";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { requireAdminContext } from "@/lib/auth/context";

export default async function TimelinePage() {
  const context = await requireAdminContext();
  const data = await getTimelineScreenData(context.organizationId);

  return <TimelineScreen {...data} />;
}
