import { TimelineScreen } from "@/features/timeline/components/timeline-screen";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { parseTimelineSearchParams } from "@/features/timeline/timeline.filters";
import type { TimelineScope } from "@/features/timeline/timeline.types";
import { requirePermission, requireSuperAdminContext } from "@/lib/auth/context";

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
  const context =
    scope === "global"
      ? await requireSuperAdminContext()
      : await requirePermission(
          scope === "property"
            ? "properties.view"
            : scope === "maintenance"
              ? "maintenance.view"
              : "finance.view",
        );
  const params = await searchParams;
  const viewQuery = parseTimelineSearchParams(params);
  const data = await getTimelineScreenData(context.organizationId, viewQuery, {
    scope,
  });

  return (
    <TimelineScreen
      {...data}
      canArchive={context.permissionKeys.has("properties.archive")}
      canWrite={context.permissionKeys.has("properties.write")}
      initialEventId={viewQuery.eventId ?? undefined}
      permissionKeys={[...context.permissionKeys]}
      scope={scope}
      title={title}
    />
  );
}
