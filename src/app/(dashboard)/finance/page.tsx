import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function FinancePage(_props: {
  searchParams?: Promise<{ view?: string }>;
} = {}) {
  void _props;
  const context = await requireFinanceContext();
  const data = await getFinanceOperationsData(context.organizationId);

  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.permissionKeys.has("leases.change_terms")}
      canManageFinanceCategories={context.isSuperAdmin}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={context.capabilities.canOperateFinance}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canRecoverHistoricalRent}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      canViewLeases={context.permissionKeys.has("leases.view")}
      organizationName={context.organizationName}
      view="work"
    />
  );
}
