import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { requireAdminContext } from "@/lib/auth/context";

export default async function OverviewPage() {
  const context = await requireAdminContext();
  const data = await getOverviewScreenData(context.organizationId);

  return <OverviewScreen data={data} />;
}
