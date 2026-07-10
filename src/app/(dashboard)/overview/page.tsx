import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { parseOverviewSearchParams } from "@/features/overview/overview.filters";
import { requireAdminContext } from "@/lib/auth/context";

type OverviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const context = await requireAdminContext();
  const query = parseOverviewSearchParams(await searchParams);
  const data = await getOverviewScreenData(context.organizationId, query);

  return <OverviewScreen data={data} query={query} />;
}
