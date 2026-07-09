import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import {
  normalizeOverviewFinanceView,
  normalizeOverviewLens,
} from "@/features/overview/overview.types";
import { requireAdminContext } from "@/lib/auth/context";

type OverviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const data = await getOverviewScreenData(context.organizationId);

  return (
    <OverviewScreen
      data={data}
      financeView={normalizeOverviewFinanceView(params.financeView)}
      lens={normalizeOverviewLens(params.lens)}
    />
  );
}
