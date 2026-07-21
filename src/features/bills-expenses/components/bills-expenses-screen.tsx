"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, Plus, RotateCcw, XCircle } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { PaginationControls } from "@/components/data/pagination-controls";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { SearchCombo } from "@/components/ui/search-combo";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPopover } from "@/components/ui/filter-popover";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import {
  approveBillsExpenseItemAction,
  createBillsExpenseItemAction,
  postBillsExpenseItemAction,
  type BillsExpensesActionState,
  voidBillsExpenseItemAction,
} from "@/features/bills-expenses/actions";
import {
  economicScopeOptions,
  expenseStatusOptions,
  expenseTypeOptions,
  ownerBillStatusOptions,
  type BillsExpenseItem,
  type BillsExpenseOption,
  type BillsExpensesPagination,
  type BillsExpensesSummary,
  type BillsExpenseUnitOption,
  type BillsExpensesViewQuery,
} from "@/features/bills-expenses/bills-expenses.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const createInitialState: BillsExpensesActionState = {};
const approveInitialState: BillsExpensesActionState = {};
const postInitialState: BillsExpensesActionState = {};
const voidInitialState: BillsExpensesActionState = {};

type DrawerState =
  | { mode: "create" }
  | { item: BillsExpenseItem; mode: "approve" }
  | { item: BillsExpenseItem; mode: "post" }
  | { item: BillsExpenseItem; mode: "void" };

type BillsExpensesScreenProps = {
  expenseItems: BillsExpenseItem[];
  pagination: BillsExpensesPagination;
  propertyOptions: BillsExpenseOption[];
  summary: BillsExpensesSummary;
  unitOptions: BillsExpenseUnitOption[];
  vendorOptions: BillsExpenseOption[];
  viewQuery: BillsExpensesViewQuery;
};

export function BillsExpensesScreen({
  expenseItems,
  pagination,
  propertyOptions,
  summary,
  unitOptions,
  vendorOptions,
  viewQuery,
}: BillsExpensesScreenProps) {
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [selectedItemId, setSelectedItemId] = useState(expenseItems[0]?.id ?? "");
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedItem =
    expenseItems.find((item) => item.id === selectedItemId) ??
    expenseItems[0] ??
    null;

  const openDrawer = (nextDrawer: DrawerState) => {
    setCompactInspectorOpen(false);
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };

  const previewItem = (itemId: string) => {
    setSelectedItemId(itemId);
    setCompactInspectorOpen(true);
  };

  const hasFilters =
    viewQuery.dateBasis !== "invoice" ||
    viewQuery.expenseType !== "all" ||
    viewQuery.propertyId !== "all" ||
    viewQuery.query.trim() !== "" ||
    viewQuery.status !== "all" ||
    viewQuery.unitId !== "all";
  const openCreate = () => openDrawer({ mode: "create" });
  const expenseList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {expenseItems.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href="/bills-expenses"
              >
                Clear filters
              </Link>
            ) : (
              <Button onClick={openCreate} variant="primary">
                <Plus size={15} />
                Add bill
              </Button>
            )
          }
          body={
            hasFilters
              ? "The current filters return no bill or expense records."
              : "Add the first outgoing bill or expense."
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching expenses" : "No bills or expenses yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <BillsExpensesTable
              expenseItems={expenseItems}
              onSelectItem={previewItem}
              selectedItemId={compactInspectorOpen ? selectedItem?.id ?? "" : ""}
            />
          </div>
          <PaginationControls attached pagination={pagination} />
        </>
      )}
    </section>
  );
  const expenseInspector = selectedItem ? (
    <BillsExpensesInspector
      item={selectedItem}
      onApprove={(item) => openDrawer({ item, mode: "approve" })}
      onPost={(item) => openDrawer({ item, mode: "post" })}
      onVoid={(item) => openDrawer({ item, mode: "void" })}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        <Button onClick={openCreate} variant="primary">
          <Plus size={15} />
          Add bill
        </Button>
      }
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref="/bills-expenses"
      localNav={<FinanceWorkspaceNavigation activeRoute="/bills-expenses" />}
      title="Bills & Expenses"
      toolbar={
        <BillsExpensesFilters
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
          viewQuery={viewQuery}
        />
      }
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">

      {statusMessage ? (
        <div className="shrink-0 px-4 py-2 sm:px-6">
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm" role="status">
            {statusMessage}
          </p>
        </div>
      ) : null}

      {viewQuery.dateBasis === "paid" ? (
        <PaidBillsExpensesSummaryStrip
          eventCount={pagination.totalCount}
          netPayments={summary.postedTotal}
        />
      ) : (
        <BillsExpensesSummaryStrip summary={summary} />
      )}

      <div className="min-h-0 min-w-0 flex-1">
        {expenseInspector && selectedItem ? (
          <WorkspaceSplitView
            inspector={expenseInspector}
            inspectorLabel={`${selectedItem.vendorLabel} expense quick view`}
            inspectorOpen={compactInspectorOpen}
            list={expenseList}
            onInspectorOpenChange={setCompactInspectorOpen}
          />
        ) : (
          <WorkspaceSplitView list={expenseList} />
        )}
      </div>

      {drawerState ? (
        <SideDrawer
          description={getDrawerDescription(drawerState)}
          onClose={() => setDrawerState(null)}
          open
          title={getDrawerTitle(drawerState)}
        >
          {drawerState.mode === "create" ? (
            <BillsExpenseForm
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              propertyOptions={propertyOptions}
              unitOptions={unitOptions}
              vendorOptions={vendorOptions}
            />
          ) : drawerState.mode === "approve" ? (
            <StatusPanel
              action={approveBillsExpenseItemAction}
              initialState={approveInitialState}
              item={drawerState.item}
              message="Approve this bill so its payment can be recorded."
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              submitLabel="Approve"
            />
          ) : drawerState.mode === "post" ? (
            <PostExpensePanel
              item={drawerState.item}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <StatusPanel
              action={voidBillsExpenseItemAction}
              initialState={voidInitialState}
              item={drawerState.item}
              message="Void this unposted bill or expense. Posted rows stay tied to the ledger."
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              submitLabel="Void"
            />
          )}
        </SideDrawer>
      ) : null}
      </div>
    </WorkspacePage>
  );
}

function BillsExpensesFilters({
  propertyOptions,
  unitOptions,
  viewQuery,
}: {
  propertyOptions: BillsExpenseOption[];
  unitOptions: BillsExpenseUnitOption[];
  viewQuery: BillsExpensesViewQuery;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(viewQuery.query);
  const activeFilterCount = [
    viewQuery.dateBasis !== "invoice",
    viewQuery.expenseType !== "all",
    viewQuery.status !== "all",
    viewQuery.propertyId !== "all",
    viewQuery.unitId !== "all",
  ].filter(Boolean).length;
  const visibleUnitOptions =
    viewQuery.propertyId === "all"
      ? unitOptions
      : unitOptions.filter(
          (unit) => unit.propertyId === viewQuery.propertyId || unit.id === viewQuery.unitId,
        );

  function replaceParam(name: string, value: string, defaultValue: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (value === defaultValue || value.trim() === "") {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }
    nextParams.delete("page");
    if (name === "propertyId") nextParams.delete("unitId");
    const nextQuery = nextParams.toString();
    startTransition(() => router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    replaceParam("query", query.trim(), "");
  }

  return (
    <div className="w-full space-y-2" data-filter-surface="bills-expenses">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="w-full sm:w-[160px] sm:shrink-0">
          <MonthPickerField ariaLabel="Expense month" defaultValue={viewQuery.month} name="month" onValueChange={(value) => replaceParam("month", value, "")} />
        </div>
        <div className="min-w-0 flex-1">
          <SearchCombo ariaLabel="Search expenses" disabled={isPending} onQueryChange={setQuery} onSubmit={submitSearch} placeholder="Search vendor, category, or reference" query={query} submitLabel="Search expenses" />
        </div>
        <div className="shrink-0">
          <FilterPopover
            activeCount={activeFilterCount}
            contentClassName="w-[min(620px,calc(100vw-2rem))]"
            description="Narrow this month by date basis, workflow state, or record."
            id="expense-advanced-filters"
            title="Filter bills and expenses"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterField label="Date basis"><SelectControl ariaLabel="Expense date basis" onValueChange={(value) => replaceParam("dateBasis", value, "invoice")} options={[{ label: "Invoice date", value: "invoice" }, { label: "Paid date", value: "paid" }]} value={viewQuery.dateBasis} /></FilterField>
              <FilterField label="Expense type"><SelectControl ariaLabel="Expense type" onValueChange={(value) => replaceParam("expenseType", value, "all")} options={[{ label: "All expense types", value: "all" }, ...expenseTypeOptions.map((option) => ({ label: option.label, value: option.value }))]} value={viewQuery.expenseType} /></FilterField>
              <FilterField label="Status"><SelectControl ariaLabel="Expense status" onValueChange={(value) => replaceParam("status", value, "all")} options={expenseStatusOptions.map((option) => ({ label: option.label, value: option.value }))} value={viewQuery.status} /></FilterField>
              <FilterField label="Property"><SelectControl ariaLabel="Property" onValueChange={(value) => replaceParam("propertyId", value, "all")} options={[{ label: "All properties", value: "all" }, ...propertyOptions.map((option) => ({ label: option.label, value: option.id }))]} value={viewQuery.propertyId} /></FilterField>
              <FilterField label="Unit"><SelectControl ariaLabel="Unit" onValueChange={(value) => replaceParam("unitId", value, "all")} options={[{ label: "All units", value: "all" }, ...visibleUnitOptions.map((option) => ({ label: option.label, value: option.id }))]} value={viewQuery.unitId} /></FilterField>
            </div>
          </FilterPopover>
        </div>
        <Link aria-label="Reset expense filters" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-muted hover:text-foreground" href="/bills-expenses" title="Reset filters">
          <RotateCcw size={14} />
        </Link>
      </div>
    </div>
  );
}

function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

function BillsExpensesSummaryStrip({
  summary,
}: {
  summary: BillsExpensesSummary;
}) {
  return (
    <section aria-label="Global expense summary" className="grid grid-flow-col auto-cols-[minmax(156px,1fr)] gap-3 overflow-x-auto border-b border-border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-6 lg:grid-flow-row lg:grid-cols-5 lg:auto-cols-auto" tabIndex={0}>
      <SummaryCard label="Approved" value={summary.approvedCount} />
      <SummaryCard label="Draft" value={summary.draftCount} />
      <SummaryCard label="Overdue" value={summary.overdueCount} />
      <SummaryCard label="Unposted" value={<MoneyDisplay value={summary.unpostedTotal} />} />
      <SummaryCard label="Posted" value={<MoneyDisplay value={summary.postedTotal} />} />
    </section>
  );
}

function PaidBillsExpensesSummaryStrip({
  eventCount,
  netPayments,
}: {
  eventCount: number;
  netPayments: BillsExpensesSummary["postedTotal"];
}) {
  return (
    <section
      aria-label="Paid expense summary"
      className="grid grid-flow-col auto-cols-[minmax(156px,220px)] gap-3 overflow-x-auto border-b border-border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-6"
      tabIndex={0}
    >
      <SummaryCard label="Event count" value={eventCount} />
      <SummaryCard label="Net payments" value={<MoneyDisplay value={netPayments} />} />
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function BillsExpensesTable({
  expenseItems,
  onSelectItem,
  selectedItemId,
}: {
  expenseItems: BillsExpenseItem[];
  onSelectItem: (itemId: string) => void;
  selectedItemId: string;
}) {
  return (
    <div className="h-full overflow-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[930px] table-fixed border-collapse text-left text-[13px]">
        <thead className="border-b border-border bg-surface-muted text-[11px] uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="px-3 py-2">Vendor / Payee</th>
            <th className="px-3 py-2">Property / Unit</th>
            <th className="px-3 py-2">Invoice / Paid</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Next</th>
            <th className="w-[74px] px-3 py-2 text-right">Preview</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {expenseItems.map((item) => (
            <tr
              className={cn(
                "cursor-pointer transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                selectedItemId === item.id && "bg-accent-soft/35",
              )}
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              onKeyDown={(event) => {
                if (event.currentTarget !== event.target) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectItem(item.id);
                }
              }}
              aria-selected={selectedItemId === item.id}
              tabIndex={0}
            >
              <td className="px-3 py-2">
                <p className="font-medium">{item.vendorLabel}</p>
                <p className="text-xs text-muted">{item.expenseTypeLabel}</p>
              </td>
              <td className="px-3 py-2">
                <Link
                  className="font-medium text-accent hover:underline"
                  href={item.hrefs.property}
                  onClick={(event) => event.stopPropagation()}
                >
                  {item.propertyName}
                </Link>
                <p className="text-xs text-muted">{item.unitNumber}</p>
              </td>
              <td className="px-3 py-2">
                <p>
                  {item.isPaymentEvent
                    ? `${getPaymentEventLabel(item)} ${item.paidDate ? formatDate(item.paidDate) : "date unavailable"}`
                    : formatDate(item.invoiceDate)}
                </p>
                {!item.isPaymentEvent && item.dueDate ? (
                  <p className={cn("text-xs text-muted", item.isOverdue && "font-semibold text-danger")}>
                    Due {formatDate(item.dueDate)}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-money-cell="true">
                <MoneyDisplay align="right" value={item.amountDisplay} />
              </td>
              <td className="px-3 py-2">{item.category}</td>
              <td className="px-3 py-2">
                <StatusBadge item={item} />
              </td>
              <td className="px-3 py-2 text-xs text-muted">
                {item.isPaymentEvent ? "Recorded" : item.nextAction}
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  aria-label={`Preview ${item.vendorLabel}`}
                  aria-pressed={selectedItemId === item.id}
                  className="h-8 w-8 px-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectItem(item.id);
                  }}
                  title={`Preview ${item.vendorLabel}`}
                  variant="ghost"
                >
                  <Eye size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillsExpensesInspector({
  item,
  onApprove,
  onPost,
  onVoid,
}: {
  item: BillsExpenseItem | null;
  onApprove: (item: BillsExpenseItem) => void;
  onPost: (item: BillsExpenseItem) => void;
  onVoid: (item: BillsExpenseItem) => void;
}) {
  if (!item) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4 text-sm text-muted">
        Select a bill or expense to inspect vendor, evidence, and ledger context.
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{item.vendorLabel}</h2>
            <p className="mt-0.5 text-xs text-muted">{item.expenseTypeLabel}</p>
          </div>
          <StatusBadge item={item} />
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          {item.isPaymentEvent ? (
            <>
              <Detail label={getPaymentEventLabel(item)}>
                <MoneyDisplay value={item.amountDisplay} />
              </Detail>
              <Detail label={`${getPaymentEventLabel(item)} date`}>
                {item.paidDate ? formatDate(item.paidDate) : "Date unavailable"}
              </Detail>
              <Detail label="Category">{item.category}</Detail>
            </>
          ) : (
            <>
              <Detail label="Amount">
                <MoneyDisplay value={item.amountDisplay} />
              </Detail>
              <Detail label="Paid">
                <MoneyDisplay value={item.amountPaidDisplay} />
              </Detail>
              <Detail label="Remaining">
                <MoneyDisplay value={item.outstandingAmountDisplay} />
              </Detail>
              <Detail label="Category">{item.category}</Detail>
              <Detail label="Invoice">{formatDate(item.invoiceDate)}</Detail>
              <Detail label="Due">
                {item.dueDate ? formatDate(item.dueDate) : "No due date"}
              </Detail>
            </>
          )}
          <Detail label="Company handling">{item.economicScopeLabel}</Detail>
          <Detail label="Owner bill status">{item.ownerBillStatusLabel}</Detail>
          <Detail label="Owner receivable">
            <MoneyDisplay value={item.ownerReceivableDisplay} />
          </Detail>
          <Detail label="Company loss">
            <MoneyDisplay value={item.companyLossDisplay} />
          </Detail>
        </div>

        <div className="space-y-2 text-sm">
          <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href={item.hrefs.property}>
            {item.propertyName}
          </Link>
          {item.hrefs.unit ? (
            <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href={item.hrefs.unit}>
              Unit {item.unitNumber}
            </Link>
          ) : null}
          {item.hrefs.ledger ? (
            <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href={item.hrefs.ledger}>
              Posted ledger entry
            </Link>
          ) : null}
        </div>

        {item.description || item.reference ? (
          <div className="rounded-md border border-border bg-surface-muted/35 p-3 text-sm">
            {item.reference ? <p className="font-medium">{item.reference}</p> : null}
            {item.description ? <p className="mt-1 text-muted">{item.description}</p> : null}
          </div>
        ) : null}

        {!item.isPaymentEvent ? <div className="flex flex-wrap gap-2">
          {item.status === "draft" ? (
            <Button onClick={() => onApprove(item)}>
              <CheckCircle2 size={15} />
              Approve
            </Button>
          ) : null}
          {item.status === "approved" && item.outstandingAmount > 0 ? (
            <Button onClick={() => onPost(item)} variant="primary">
              <CheckCircle2 size={15} />
              Record payment
            </Button>
          ) : null}
          {item.status === "posted" && item.outstandingAmount > 0 ? (
            <Button onClick={() => onPost(item)}>
              <CheckCircle2 size={15} />
              Record payment
            </Button>
          ) : null}
          {item.status !== "posted" && item.status !== "paid" ? (
            <Button onClick={() => onVoid(item)} variant="ghost">
              <XCircle size={15} />
              Void
            </Button>
          ) : null}
        </div> : null}
      </div>
    </aside>
  );
}

function BillsExpenseForm({
  onClose,
  onSuccess,
  propertyOptions,
  unitOptions,
  vendorOptions,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  propertyOptions: BillsExpenseOption[];
  unitOptions: BillsExpenseUnitOption[];
  vendorOptions: BillsExpenseOption[];
}) {
  const [state, action, pending] = useActionState(
    createBillsExpenseItemAction,
    createInitialState,
  );

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <FormSection title="Bill record">
          <Field label="Expense type" error={state.fieldErrors?.expenseType?.[0]}>
            <SelectControl
              defaultValue="vendor_bill"
              name="expenseType"
              options={expenseTypeOptions.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              required
            />
          </Field>
          <Field label="Vendor / payee" error={state.fieldErrors?.vendorLabel?.[0]}>
            <Input name="vendorLabel" placeholder="Vendor, owner, or payee" required />
          </Field>
          <Field
            label="Known vendor record"
            error={state.fieldErrors?.vendorPersonId?.[0]}
          >
            <SelectControl
              name="vendorPersonId"
              options={[
                { label: "No people link", value: "" },
                ...vendorOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                })),
              ]}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
              <SelectControl
                name="propertyId"
                options={propertyOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                }))}
                placeholder="Choose property"
                required
              />
            </Field>
            <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
              <SelectControl
                name="unitId"
                options={[
                  { label: "No unit", value: "" },
                  ...unitOptions.map((option) => ({
                    label: option.label,
                    value: option.id,
                  })),
                ]}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Company / owner handling">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Company handling"
              error={state.fieldErrors?.economicScope?.[0]}
            >
              <SelectControl
                defaultValue="property_expense"
                name="economicScope"
                options={economicScopeOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                required
              />
            </Field>
            <Field
              label="Owner bill status"
              error={state.fieldErrors?.ownerBillStatus?.[0]}
            >
              <SelectControl
                defaultValue="not_billable"
                name="ownerBillStatus"
                options={ownerBillStatusOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                required
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Owner billable"
              error={state.fieldErrors?.ownerReimbursableAmount?.[0]}
            >
              <NumberInput name="ownerReimbursableAmount" placeholder="0.00" />
            </Field>
            <Field
              label="Owner reimbursed"
              error={state.fieldErrors?.ownerReimbursedAmount?.[0]}
            >
              <NumberInput name="ownerReimbursedAmount" placeholder="0.00" />
            </Field>
            <Field
              label="Company loss"
              error={state.fieldErrors?.companyLossAmount?.[0]}
            >
              <NumberInput name="companyLossAmount" placeholder="0.00" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Dates and amount">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice date" error={state.fieldErrors?.invoiceDate?.[0]}>
              <DatePickerField
                defaultValue={getBusinessDateValue()}
                name="invoiceDate"
                required
              />
            </Field>
            <Field label="Due date" error={state.fieldErrors?.dueDate?.[0]}>
              <DatePickerField name="dueDate" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" error={state.fieldErrors?.amount?.[0]}>
              <NumberInput name="amount" placeholder="0.00" required />
            </Field>
            <Field label="Category" error={state.fieldErrors?.category?.[0]}>
              <Input name="category" placeholder="Maintenance, utilities..." required />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Reference">
          <Field label="Reference" error={state.fieldErrors?.reference?.[0]}>
            <Input name="reference" placeholder="Invoice or receipt number" />
          </Field>
          <Field label="Note" error={state.fieldErrors?.description?.[0]}>
            <Textarea name="description" rows={4} />
          </Field>
        </FormSection>

        {state.message ? <FormMessage state={state} /> : null}
      </div>
      <DrawerActions onCancel={onClose} pending={pending} submitLabel="Save bill" />
    </form>
  );
}

function PostExpensePanel({
  item,
  onClose,
  onSuccess,
}: {
  item: BillsExpenseItem;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    postBillsExpenseItemAction,
    postInitialState,
  );

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <input name="expenseItemId" type="hidden" value={item.id} />
        <input
          name="amount"
          type="hidden"
          value={String(item.outstandingAmount)}
        />
        <input name="propertyId" type="hidden" value={item.propertyId} />
        <input name="reference" type="hidden" value={item.reference} />
        <input name="unitId" type="hidden" value={item.unitId ?? ""} />
        <ConsequencePanel
          rows={[
            { label: "Payee", value: item.vendorLabel },
            { label: "Cash payment", value: item.outstandingAmountDisplay.primary },
            { label: "Remaining after payment", value: formatMoneyDisplay(0, item.currency).primary },
            { label: "Ledger effect", value: "Payment and settlement allocation" },
          ]}
          summary={`Records the remaining property payment of ${item.outstandingAmountDisplay.primary} and its settlement allocation.`}
          title="Payment consequence"
        />
        <Field label="Payment date" error={state.fieldErrors?.paidDate?.[0]}>
          <DatePickerField
            defaultValue={item.paidDate ?? item.invoiceDate}
            name="paidDate"
            required
          />
        </Field>
        {state.message ? <FormMessage state={state} /> : null}
      </div>
      <DrawerActions
        onCancel={onClose}
        pending={pending}
        submitLabel="Record payment"
      />
    </form>
  );
}

function StatusPanel({
  action,
  initialState,
  item,
  message,
  onClose,
  onSuccess,
  submitLabel,
}: {
  action: (
    state: BillsExpensesActionState,
    formData: FormData,
  ) => Promise<BillsExpensesActionState>;
  initialState: BillsExpensesActionState;
  item: BillsExpenseItem;
  message: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={formAction} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <input name="expenseItemId" type="hidden" value={item.id} />
        <ConsequencePanel
          className={submitLabel === "Void" ? "border-danger/30 bg-danger-soft" : undefined}
          rows={[{ label: "Bill", value: item.vendorLabel }]}
          summary={message}
          title={`${submitLabel} consequence`}
        />
        {state.message ? <FormMessage state={state} /> : null}
      </div>
      <DrawerActions
        onCancel={onClose}
        pending={pending}
        submitLabel={submitLabel}
      />
    </form>
  );
}

function FormSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-4">
      <h3 className="border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function DrawerActions({
  onCancel,
  pending,
  submitLabel,
}: {
  onCancel: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="border-t border-border bg-surface px-5 py-4">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant="primary"
        >
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function FormMessage({ state }: { state: BillsExpensesActionState }) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        state.status === "success"
          ? "border-success/40 bg-success/10"
          : "border-danger/40 bg-danger/10",
      )}
    >
      {state.message}
    </p>
  );
}

function Detail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

function StatusBadge({ item }: { item: BillsExpenseItem }) {
  const paymentEventLabel = item.isPaymentEvent
    ? getPaymentEventLabel(item)
    : null;

  return (
    <Badge
      tone={
        paymentEventLabel
          ? paymentEventLabel === "Reversed"
            ? "danger"
            : "success"
          : item.status === "paid" || item.status === "posted"
          ? "success"
          : item.isOverdue
            ? "danger"
            : item.status === "approved"
              ? "warning"
              : "neutral"
      }
    >
      {paymentEventLabel ?? (item.isOverdue ? "Overdue" : item.statusLabel)}
    </Badge>
  );
}

function getPaymentEventLabel(item: BillsExpenseItem): "Payment" | "Reversed" {
  return item.amount < 0 ? "Reversed" : "Payment";
}

function useCloseOnSuccess(
  state: BillsExpensesActionState,
  onClose: () => void,
  onSuccess: (message: string) => void,
) {
  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    onSuccess(state.message ?? "Saved.");
    onClose();
  }, [onClose, onSuccess, state.message, state.status]);
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Add bill or expense";
  }

  if (drawer.mode === "approve") {
    return "Approve bill";
  }

  if (drawer.mode === "post") {
    return "Record payment";
  }

  return "Void bill";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create outgoing money that needs approval, posting, or evidence.";
  }

  if (drawer.mode === "approve") {
    return "Approved bills can have their property payment recorded.";
  }

  if (drawer.mode === "post") {
    return "Record the outgoing property cash event for this bill.";
  }

  return "Void this unposted bill or expense.";
}
