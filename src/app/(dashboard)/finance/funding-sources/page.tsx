import { FinanceSourcesScreen } from "@/features/finance-sources/components/finance-sources-screen";
import { getFinanceSourcesData } from "@/features/finance-sources/data/finance-sources";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function FundingSourcesPage() {
  const context = await requireFinanceContext();
  const data = await getFinanceSourcesData(context.organizationId);

  return (
    <FinanceSourcesScreen
      {...data}
      canManageSources={context.capabilities.canManageReconciliationSources}
    />
  );
}
