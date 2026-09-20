import type { ExpenseSubmissionSummary, FinanceOperationsData, PropertyAccountEntry, TenantInvoiceSettlement, TenantInvoiceSummary } from "../finance-operations.types";

export type TransactionSource =
  | { kind: "charge"; invoice: TenantInvoiceSummary }
  | { kind: "payment"; invoice: TenantInvoiceSummary; settlement: TenantInvoiceSettlement }
  | { kind: "expense"; submission: ExpenseSubmissionSummary }
  | { kind: "contribution" | "distribution"; entry: PropertyAccountEntry }
  | { kind: "account"; entry: PropertyAccountEntry };
export type TransactionRow = {
  id: string; sourceId: string; kind: TransactionSource["kind"] | "management_fee"; date: string; label: string;
  propertyId: string; unitId: string | null; unitLabel: string; tenant: string;
  amount: number; status: string; history: boolean; source: TransactionSource;
};
export type TransactionScope = { propertyId: string; unitId?: string };
export type TransactionFilters = TransactionScope & { month?: string; kind?: string; status?: string; tenant?: string; query?: string; includeHistory?: boolean };

/** Business documents only: invoice allocations and the owner account are not added together. */
export function projectTransactions(data: Pick<FinanceOperationsData, "tenantInvoices" | "expenseSubmissions" | "accountEntries"> & { leases?: FinanceOperationsData["leases"]; historicalLeases?: FinanceOperationsData["historicalLeases"]; accountSourcesComplete?: boolean }): TransactionRow[] {
  const rows: TransactionRow[] = [];
  for (const invoice of data.tenantInvoices) {
    const common = { propertyId: invoice.propertyId, unitId: invoice.unitId, unitLabel: invoice.unitLabel, tenant: invoice.recipientLabel };
    rows.push({ ...common, id: `charge:${invoice.id}`, sourceId: invoice.id, kind: "charge", date: invoice.issueDate, label: invoice.invoiceNumber, amount: invoice.totalAmount, status: invoice.paymentStatus, history: invoice.paymentStatus === "voided", source: { kind: "charge", invoice } });
    for (const settlement of invoice.settlements) rows.push({ ...common, id: `payment:${invoice.id}:${settlement.route}:${settlement.id}`, sourceId: settlement.id, kind: "payment", date: settlement.date, label: settlement.receiptNumber || settlement.reference || `Payment · ${invoice.invoiceNumber}`, amount: settlement.amount, status: settlement.isReversed ? "reversed" : "received", history: settlement.isReversed, source: { kind: "payment", invoice, settlement } });
  }
  for (const submission of data.expenseSubmissions) rows.push({ id: `expense:${submission.id}`, sourceId: submission.id, kind: "expense", date: submission.date, label: submission.reference || submission.vendorLabel || submission.categoryLabel || submission.category, propertyId: submission.propertyId, unitId: submission.unitId, unitLabel: submission.unitLabel, tenant: "", amount: submission.scopedSubtotal ?? submission.internalCost, status: submission.cancelledAt ? "cancelled" : submission.status, history: Boolean(submission.cancelledAt || submission.replacementTransactionId || submission.status === "reversed"), source: { kind: "expense", submission } });
  for (const entry of data.accountEntries) {
    const kind = entry.source?.kind ?? (entry.sourceType === "owner_contribution" ? "contribution" : entry.sourceType === "property_withdrawal" ? "distribution" : null);
    if (kind !== "contribution" && kind !== "distribution") {
      if (entry.source?.kind === "rent" && data.tenantInvoices.some(invoice => invoice.id === entry.source!.id)) continue;
      if (entry.source?.kind === "expense" && data.expenseSubmissions.some(submission => submission.id === entry.source!.id || submission.lines?.some(line => line.submissionId === entry.source!.id))) continue;
      // Unresolved allocations cannot be matched safely to documents; do not duplicate their cash.
      if (!data.accountSourcesComplete && !entry.source && ["tenant_invoice_payment", "owner_collection_confirmation", "ips_expense_responsibility"].includes(entry.sourceType)) continue;
      const lease = entry.source?.kind === "lease" ? (data.historicalLeases ?? data.leases)?.find(lease => lease.id === entry.source!.id) : undefined;
      const history = entry.source?.isReversed === true || ["property_withdrawal_reversal", "expense_customer_adjustment"].includes(entry.sourceType) || entry.sourceType === "management_fee_occurrence" && entry.amount < 0;
      rows.push({ id: `account:${entry.sourceType}:${entry.id}`, sourceId: entry.source?.id ?? entry.id, kind: entry.sourceType === "management_fee_occurrence" ? "management_fee" : "account", date: entry.date, label: entry.label, propertyId: entry.propertyId, unitId: lease?.unitId ?? null, unitLabel: lease?.unitLabel ?? "Property", tenant: lease?.tenantLabel ?? "", amount: entry.amount, status: history ? "reversed" : "posted", history, source: {kind: "account", entry} });
      continue;
    }
    const history = entry.source?.isReversed === true || entry.amount < 0;
    rows.push({ id: `${kind}:${entry.id}`, sourceId: entry.source?.id ?? entry.id, kind, date: entry.date, label: entry.label, propertyId: entry.propertyId, unitId: null, unitLabel: "Property", tenant: "", amount: entry.amount, status: history ? "reversed" : "posted", history, source: { kind, entry } });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function filterTransactions(rows: TransactionRow[], filters: TransactionFilters) {
  const query = filters.query?.trim().toLocaleLowerCase();
  const scopedRows = rows.flatMap(row => {
    if (!filters.unitId || row.source.kind !== "expense" || !row.source.submission.lines?.length) return [row];
    const submission = row.source.submission;
    const lines = submission.lines!.filter(line => line.propertyId === filters.propertyId && line.unitId === filters.unitId);
    if (!lines.length) return [];
    const amount = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) / 100;
    return [{ ...row, propertyId: filters.propertyId, unitId: filters.unitId, unitLabel: lines[0].unitLabel, amount, source: { kind: "expense" as const, submission: { ...submission, lines, scopedSubtotal: amount, transactionReviewBlocked: submission.transactionReviewBlocked || lines.length !== submission.lines!.length } } }];
  });
  return scopedRows.filter((row) => row.propertyId === filters.propertyId &&
    (!filters.unitId || row.unitId === filters.unitId) &&
    (!filters.month || row.date.startsWith(`${filters.month}-`)) &&
    (!filters.kind || filters.kind === "all" || row.kind === filters.kind) &&
    (!filters.status || filters.status === "all" || row.status === filters.status) &&
    (!filters.tenant || filters.tenant === "all" || row.tenant === filters.tenant) &&
    (filters.includeHistory || !row.history) &&
    (!query || [row.label, row.tenant, row.unitLabel, row.kind].some(value => value.toLocaleLowerCase().includes(query))));
}

export function transactionReportLinks(scope: TransactionScope, month: string, ownerPersonId?: string | null) {
  const params = new URLSearchParams({ month, propertyId: scope.propertyId });
  if (scope.unitId) params.set("unitId", scope.unitId);
  const profitLoss = new URLSearchParams(params);
  profitLoss.set("report", "unit-profit-loss");
  const owner = new URLSearchParams({ month, propertyId: scope.propertyId, view: "statements" });
  if (ownerPersonId) owner.set("ownerPersonId", ownerPersonId);
  return { profitLoss: `/reports/unit-profit-loss?${params}`, pdf: `/api/reports/pdf?${profitLoss}`, excel: `/api/reports/excel?${profitLoss}`, ownerStatement: `/balances?${owner}` };
}
