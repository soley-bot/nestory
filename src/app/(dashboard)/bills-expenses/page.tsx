import { ReportReturnNavigation } from "@/features/reports/components/report-return-navigation";
import { reportReturnHref } from "@/features/reports/report-return";
import { resolveExpenseReportSource } from "@/features/finance-operations/expense-report-source";
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
  const source = await resolveExpenseReportSource(context.organizationId, params.sourceType, params.sourceId);
  const expenseMonth = source?.expense_date.slice(0, 7) ?? (typeof params.expenseMonth === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(params.expenseMonth) ? params.expenseMonth : "");
  const data = await getFinanceOperationsData(context.organizationId, undefined, { expenseMonth });
  return (
    <>
    <ReportReturnNavigation returnTo={reportReturnHref(params.returnTo)} />
    {params.sourceId && !source ? <p role="alert" className="workspace-gutter-x py-3">This report transaction is unavailable or outside your access.</p> : null}
    <FinanceOperationsScreen
      key={source?.id ?? "expenses"}
      initialExpenseId={source?.id}
      isSuperAdmin={context.isSuperAdmin}
      currentUserId={context.userId}
      canApproveOwnExpense={context.capabilities.canReverseExpense}
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
    </>
  );
}
