import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function RentIncomePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ action?: string; leaseId?: string }>;
} = {}) {
  const context = await requireFinanceContext();
  const data = await getFinanceOperationsData(context.organizationId);
  const query = await searchParams;
  const initialBillingLeaseId =
    query.action === "billing" ? query.leaseId : undefined;
  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={context.capabilities.canOperateFinance}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canRecoverHistoricalRent}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      initialBillingLeaseId={initialBillingLeaseId}
      initialRentLeaseId={query.leaseId}
      organizationName={context.organizationName}
      view="rent"
    />
  );
}
