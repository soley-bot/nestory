import { ReportReturnNavigation } from "@/features/reports/components/report-return-navigation";
import { reportReturnHref } from "@/features/reports/report-return";
import { createSupabaseServerClient } from "@/lib/db/server";
import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function RentIncomePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ action?: string; leaseId?: string; invoiceId?: string; returnTo?: string }>;
} = {}) {
  const context = await requireFinanceContext();
  const query = await searchParams;
  const db = await createSupabaseServerClient();
  const selectedInvoice = typeof query.invoiceId === "string" && /^[0-9a-f-]{36}$/i.test(query.invoiceId)
    ? await db.from("tenant_invoices").select("id,property_id").eq("organization_id", context.organizationId).eq("id", query.invoiceId).maybeSingle()
    : null;
  if (selectedInvoice?.error) throw new Error("Could not load the report invoice.");
  const data = await getFinanceOperationsData(context.organizationId, selectedInvoice?.data?.property_id, { includeExpenses: false, completeTransactionHistory: Boolean(selectedInvoice?.data) });
  const initialBillingLeaseId =
    query.action === "billing" ? query.leaseId : undefined;
  return (
    <>
    <ReportReturnNavigation returnTo={reportReturnHref(query.returnTo)} />
    {query.invoiceId && !selectedInvoice?.data ? <p role="alert" className="workspace-gutter-x py-3">This report invoice is unavailable or outside your access.</p> : null}
    <FinanceOperationsScreen
      key={selectedInvoice?.data?.id ?? "rent"}
      initialInvoiceId={selectedInvoice?.data?.id}
      isSuperAdmin={context.isSuperAdmin}
      currentUserId={context.userId}
      canApproveOwnExpense={context.capabilities.canReverseExpense}
      {...data}
      canConfigureRent={context.permissionKeys.has("leases.change_terms")}
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
      initialBillingLeaseId={initialBillingLeaseId}
      initialRentLeaseId={query.leaseId}
      organizationName={context.organizationName}
      view="rent"
    />
    </>
  );
}
