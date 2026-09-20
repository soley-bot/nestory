"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import { MoneyDisplay } from "@/components/data/money-display";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import type { ExpenseSubmissionSummary, FinanceOperationsData, PropertyAccountEntry, TenantInvoiceSummary } from "../finance-operations.types";
import { filterTransactions, projectTransactions, transactionReportLinks, type TransactionRow, type TransactionScope } from "../data/transaction-workspace";

export function TransactionWorkspace({ data, scope, actions, canReadReports, onOpenInvoice, onOpenExpense, renderAccountActions, renderTransactionActions }: {
  data: FinanceOperationsData; scope: TransactionScope; actions?: (scope: TransactionScope) => ReactNode; canReadReports: boolean;
  onOpenInvoice: (invoice: TenantInvoiceSummary) => void;
  onOpenExpense: (submission: ExpenseSubmissionSummary) => void;
  renderAccountActions: (entry: PropertyAccountEntry) => ReactNode;
  renderTransactionActions?: (row: TransactionRow) => ReactNode;
}) {
  const [month, setMonth] = useState(getBusinessMonthValue());
  const [unitId, setUnitId] = useState(scope.unitId ?? "all");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [tenant, setTenant] = useState("all");
  const [query, setQuery] = useState("");
  const [includeHistory, setIncludeHistory] = useState(false);
  const rows = useMemo(() => projectTransactions(data), [data]);
  const effectiveScope = { propertyId: scope.propertyId, unitId: scope.unitId ?? (unitId === "all" ? undefined : unitId) };
  const visible = filterTransactions(rows, { ...effectiveScope, month, kind, status, tenant, query, includeHistory });
  const scopedRows = filterTransactions(rows, { ...effectiveScope, includeHistory: true });
  const position = data.positions.find(item => item.propertyId === scope.propertyId);
  const links = transactionReportLinks(effectiveScope, month, position?.ownerPersonId);
  const due = data.tenantInvoices.filter(invoice => invoice.propertyId === scope.propertyId && (!effectiveScope.unitId || invoice.unitId === effectiveScope.unitId) && invoice.paymentStatus !== "voided").reduce((sum, invoice) => sum + Math.round(invoice.balanceDue * 100), 0) / 100;
  return <section aria-label="Transactions" className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-6">
    <div className="flex flex-wrap items-center gap-2">{actions?.(effectiveScope)}</div>
    <dl className="flex flex-wrap gap-x-10 gap-y-3 border-y py-3 text-sm">
      <div><dt className="text-muted-foreground">Tenant amount due · current</dt><dd className="font-semibold"><MoneyDisplay value={formatMoneyDisplay(due)} /></dd></div>
      {!effectiveScope.unitId && position ? <div><dt className="text-muted-foreground">Owner cash held · current</dt><dd className="font-semibold"><MoneyDisplay value={formatMoneyDisplay(position.cashHeldByIps)} /></dd></div> : null}
    </dl>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
      <MonthPickerField ariaLabel="Transaction period" name="transactionMonth" defaultValue={month} onValueChange={setMonth} />
      {!scope.unitId ? <SelectControl ariaLabel="Transaction unit" value={unitId} onValueChange={setUnitId} options={[{value: "all", label: "All units"}, ...data.unitOptions.filter(unit => !unit.propertyId || unit.propertyId === scope.propertyId).map(unit => ({value: unit.id, label: unit.label}))]} /> : null}
      <SelectControl ariaLabel="Transaction type" value={kind} onValueChange={setKind} options={[{value: "all", label: "All types"}, ...Object.entries(kindLabels).map(([value, label]) => ({value, label}))]} />
      <SelectControl ariaLabel="Transaction status" value={status} onValueChange={setStatus} options={[{value: "all", label: "All statuses"}, ...[...new Set(scopedRows.map(row => row.status))].sort().map(value => ({value, label: value.replaceAll("_", " ")}))]} />
      <SelectControl ariaLabel="Transaction tenant" value={tenant} onValueChange={setTenant} options={[{value: "all", label: "All tenants"}, ...[...new Set(scopedRows.map(row => row.tenant).filter(Boolean))].sort().map(value => ({value, label: value}))]} />
      <Input aria-label="Search transactions" placeholder="Search transactions" value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={includeHistory} onChange={event => setIncludeHistory(event.target.checked)} />Show correction history</label>
      {canReadReports ? <details><summary className="cursor-pointer font-medium">Reports</summary><div className="flex flex-wrap items-center gap-4 py-3">
        <Link href={links.ownerStatement}>Owner statement (property)</Link>
        <Link href={links.profitLoss}>Profit &amp; loss</Link>
        <a href={links.pdf}>P&amp;L PDF</a><a href={links.excel}>P&amp;L XLSX</a>
        <span className="text-xs text-muted-foreground">Owner statements cover property-wide cash; open a published revision for PDF or XLSX.</span>
      </div></details> : null}
    </div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-[var(--table-header-bg)]"><tr>{["Date", "Transaction", "Type", "Unit / tenant", "Status", "Amount", "Actions"].map(label => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>
      {visible.map(row => <tr key={row.id} className="border-t"><td className="whitespace-nowrap px-3 py-3">{formatDate(row.date)}</td><td className="px-3 py-3">{row.label}</td><td className="px-3 py-3">{kindLabels[row.kind]}</td><td className="px-3 py-3">{row.unitLabel || "Property"}{row.tenant ? <span className="block text-muted-foreground">{row.tenant}</span> : null}</td><td className="px-3 py-3 capitalize">{row.status.replaceAll("_", " ")}</td><td className="whitespace-nowrap px-3 py-3"><MoneyDisplay value={formatMoneyDisplay(row.amount)} /></td><td className="px-3 py-3">{row.source.kind === "contribution" || row.source.kind === "distribution" || row.source.kind === "account" ? renderAccountActions(row.source.entry) : <><Button variant="ghost" size="sm" onClick={() => row.source.kind === "expense" ? onOpenExpense(row.source.submission) : row.source.kind === "charge" || row.source.kind === "payment" ? onOpenInvoice(row.source.invoice) : undefined}>Details</Button>{renderTransactionActions?.(row)}</>}</td></tr>)}
      {!visible.length ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No transactions match this period and filters.</td></tr> : null}
    </tbody></table></div>
    <p className="text-xs text-muted-foreground">{visible.length} transactions · Charges show amounts billed. Payments show amounts received. These are separate activities.</p>
  </section>;
}
const kindLabels = { charge: "Charge", payment: "Payment", expense: "Expense", contribution: "Owner contribution", distribution: "Owner distribution", management_fee: "Management fee", account: "Account activity" };
