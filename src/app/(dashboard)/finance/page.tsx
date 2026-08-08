import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function FinancePage() {
  const context = await requireFinanceContext();
  const data = await getFinanceOperationsData(context.organizationId);
  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canManageFinance={context.capabilities.canManageFinanceOperations}
      canRecoverRent={context.capabilities.canConfigureLeases}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      organizationName={context.organizationName}
      view="work"
    />
  );
}
