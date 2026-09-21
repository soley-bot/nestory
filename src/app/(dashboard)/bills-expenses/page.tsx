import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

type BillsExpensesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BillsExpensesPage({
  searchParams,
}: BillsExpensesPageProps) {
  const params = (await searchParams) ?? {};
  const initialExpenseIntent =
    params.action === "record-recoverable-cost"
      ? "tenant"
      : params.action === "create" || params.action === "record-property-expense"
        ? "owner"
        : undefined;
  const context = await requireFinanceContext();
  const expenseMonth = typeof params.expenseMonth === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(params.expenseMonth) ? params.expenseMonth : "";
  const data = await getFinanceOperationsData(context.organizationId, undefined, { expenseMonth });
  return (
    <FinanceOperationsScreen
      isSuperAdmin={context.isSuperAdmin}
      currentUserId={context.userId}
      canApproveOwnExpense={context.isSuperAdmin}
      {...data}
      canConfigureRent={context.permissionKeys.has("leases.change_terms")}
      canCreateVendor={context.permissionKeys.has("people.view") && context.permissionKeys.has("people.write")}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={context.capabilities.canOperateFinance}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canRecoverHistoricalRent}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      canViewPropertyRecords={context.permissionKeys.has("properties.view")}
      initialExpenseIntent={initialExpenseIntent}
      organizationName={context.organizationName}
      expenseMonth={expenseMonth}
      view="expenses"
    />
  );
}
