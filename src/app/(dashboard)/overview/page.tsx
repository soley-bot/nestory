import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { parseOverviewSearchParams } from "@/features/overview/overview.filters";
import { buildAdminWorkspaceQueue } from "@/features/workspace-operations/admin-workspace";
import { requireSuperAdminContext } from "@/lib/auth/context";

type OverviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const context = await requireSuperAdminContext();
  const query = parseOverviewSearchParams(await searchParams);
  const data = await getOverviewScreenData(context.organizationId, query);
  const attentionQueue = buildAdminWorkspaceQueue(data);

  return (
    <OverviewScreen
      attentionQueue={attentionQueue}
      data={data}
      query={query}
    />
  );
}
