import Link from "next/link";
import { ReportReturnNavigation } from "@/features/reports/components/report-return-navigation";
import { reportReturnHref } from "@/features/reports/report-return";
import { createSupabaseServerClient } from "@/lib/db/server";
import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { parseRentInvoiceQuery, RentPropertyUnavailableError, type RentInvoiceSearchParams } from "@/features/finance-operations/rent-invoice-query";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function RentIncomePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<RentInvoiceSearchParams & { action?: string; leaseId?: string; invoiceId?: string; returnTo?: string }>;
}) {
  const context = await requireFinanceContext();
  const query = await searchParams;
  const selectedInvoice = typeof query.invoiceId === "string" && /^[0-9a-f-]{36}$/i.test(query.invoiceId)
    ? await (await createSupabaseServerClient()).from("tenant_invoices").select("id,property_id").eq("organization_id", context.organizationId).eq("id", query.invoiceId).maybeSingle()
    : null;
  if (selectedInvoice?.error) throw new Error("Could not load the report invoice.");
  let data: Awaited<ReturnType<typeof getFinanceOperationsData>>;
  try {
    const rentInvoiceQuery = parseRentInvoiceQuery(query);
    data = await getFinanceOperationsData(context.organizationId, rentInvoiceQuery.propertyId, {
      includeExpenses: false,
      rentInvoiceQuery: { ...rentInvoiceQuery, ...(!query.invoiceId && query.action !== "billing" && query.leaseId ? { leaseId: query.leaseId } : {}), selectedInvoiceId: selectedInvoice?.data?.id },
    });
  } catch (error) {
    if (!(error instanceof RentPropertyUnavailableError)) throw error;
    const remaining = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "property" || key === "page" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) remaining.append(key, item);
    }
    return <>
      <ReportReturnNavigation returnTo={reportReturnHref(query.returnTo)} />
      <section className="workspace-gutter-x space-y-3 py-6">
        <h1 className="text-xl font-semibold">Rent income</h1>
        <p role="alert">This property is unavailable for your current access.</p>
        <Link className="text-sm underline" href={`/rent-income${remaining.size ? `?${remaining}` : ""}`}>Clear property filter</Link>
      </section>
    </>;
  }
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
      canViewLeases={context.permissionKeys.has("leases.view")}
      canViewPropertyRecords={context.permissionKeys.has("properties.view")}
      initialBillingLeaseId={initialBillingLeaseId}
      initialRentLeaseId={query.invoiceId || query.action === "billing" ? undefined : query.leaseId}
      organizationName={context.organizationName}
      view="rent"
    />
    </>
  );
}
