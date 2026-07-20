"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import { Coins, Eye, Plus, Send, XCircle } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { PaginationControls } from "@/components/data/pagination-controls";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  useWideWorkspace,
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import {
  createRentIncomeItemAction,
  postRentIncomeItemAction,
  recordRentIncomePaymentAction,
  type RentIncomeActionState,
  voidRentIncomeItemAction,
} from "@/features/rent-income/actions";
import {
  incomeStatusOptions,
  incomeTypeOptions,
  type RentIncomeItem,
  type RentIncomeLeaseOption,
  type RentIncomeOption,
  type RentIncomePagination,
  type RentIncomeSummary,
  type RentIncomeUnitOption,
  type RentIncomeViewQuery,
} from "@/features/rent-income/rent-income.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

const createInitialState: RentIncomeActionState = {};
const paymentInitialState: RentIncomeActionState = {};
const postInitialState: RentIncomeActionState = {};
const voidInitialState: RentIncomeActionState = {};

type DrawerState =
  | { mode: "create" }
  | { item: RentIncomeItem; mode: "payment" }
  | { item: RentIncomeItem; mode: "post" }
  | { item: RentIncomeItem; mode: "void" };

type RentIncomeScreenProps = {
  incomeItems: RentIncomeItem[];
  leaseOptions: RentIncomeLeaseOption[];
  pagination: RentIncomePagination;
  propertyOptions: RentIncomeOption[];
  summary: RentIncomeSummary;
  unitOptions: RentIncomeUnitOption[];
  viewQuery: RentIncomeViewQuery;
};

export function RentIncomeScreen({
  incomeItems,
  leaseOptions,
  pagination,
  propertyOptions,
  summary,
  unitOptions,
  viewQuery,
}: RentIncomeScreenProps) {
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [selectedItemId, setSelectedItemId] = useState(incomeItems[0]?.id ?? "");
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
  const isWideWorkspace = useWideWorkspace();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedItem =
    incomeItems.find((item) => item.id === selectedItemId) ??
    incomeItems[0] ??
    null;

  const openDrawer = (nextDrawer: DrawerState) => {
    if (!isWideWorkspace) {
      setCompactInspectorOpen(false);
    }
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };

  const previewItem = (itemId: string) => {
    setSelectedItemId(itemId);
    setCompactInspectorOpen(true);
  };

  const hasFilters =
    viewQuery.incomeScope !== "all" ||
    viewQuery.propertyId !== "all" ||
    viewQuery.query.trim() !== "" ||
    viewQuery.status !== "all" ||
    viewQuery.unitId !== "all";
  const openCreate = () => openDrawer({ mode: "create" });
  const incomeList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {incomeItems.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href="/rent-income"
              >
                Clear filters
              </Link>
            ) : (
              <Button onClick={openCreate} variant="primary">
                <Plus size={15} />
                Add income
              </Button>
            )
          }
          body={
            hasFilters
              ? "The current filters return no income records."
              : "Add the first expected or received income record."
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching income" : "No income yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <RentIncomeTable
              incomeItems={incomeItems}
              onSelectItem={previewItem}
              selectedItemId={selectedItem?.id ?? ""}
            />
          </div>
          <PaginationControls attached pagination={pagination} />
        </>
      )}
    </section>
  );
  const incomeInspector = selectedItem ? (
    <RentIncomeInspector
      item={selectedItem}
      onPost={(item) => openDrawer({ item, mode: "post" })}
      onRecordPayment={(item) => openDrawer({ item, mode: "payment" })}
      onVoid={(item) => openDrawer({ item, mode: "void" })}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        <Button onClick={openCreate} variant="primary">
          <Plus size={15} />
          Add income
        </Button>
      }
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref="/rent-income"
      title="Rent & Income"
      toolbar={
        <RentIncomeFilters
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

      {viewQuery.incomeScope === "all" ? <RentIncomeSummaryStrip summary={summary} /> : <ScopedSummary label="Management fees" totalCount={pagination.totalCount} />}

      <div className="min-h-0 min-w-0 flex-1">
        {incomeInspector && selectedItem ? (
          <WorkspaceSplitView
            inspector={incomeInspector}
            inspectorLabel={`${selectedItem.payerLabel} income inspector`}
            inspectorOpen={isWideWorkspace || compactInspectorOpen}
            list={incomeList}
            onInspectorOpenChange={setCompactInspectorOpen}
          />
        ) : (
          <WorkspaceSplitView list={incomeList} />
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
            <RentIncomeForm
              leaseOptions={leaseOptions}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              propertyOptions={propertyOptions}
              unitOptions={unitOptions}
            />
          ) : drawerState.mode === "payment" ? (
            <RecordPaymentPanel
              item={drawerState.item}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "post" ? (
            <PostIncomePanel
              item={drawerState.item}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <VoidIncomePanel
              item={drawerState.item}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          )}
        </SideDrawer>
      ) : null}
      </div>
    </WorkspacePage>
  );
}

function RentIncomeFilters({
  propertyOptions,
  unitOptions,
  viewQuery,
}: {
  propertyOptions: RentIncomeOption[];
  unitOptions: RentIncomeUnitOption[];
  viewQuery: RentIncomeViewQuery;
}) {
  return (
    <form
      action="/rent-income"
      className="grid w-full gap-2 lg:grid-cols-[150px_160px_180px_minmax(160px,1fr)_minmax(160px,1fr)_minmax(180px,1.2fr)_auto]"
    >
      <MonthPickerField
        ariaLabel="Income month"
        defaultValue={viewQuery.month}
        name="month"
      />
      <SelectControl ariaLabel="Income scope" defaultValue={viewQuery.incomeScope} name="incomeScope" options={[{ label: "All income", value: "all" }, { label: "Management fees", value: "management-fees" }]} />
      <SelectControl
        ariaLabel="Income status"
        defaultValue={viewQuery.status}
        name="status"
        options={incomeStatusOptions.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
      />
      <SelectControl
        ariaLabel="Property"
        defaultValue={viewQuery.propertyId}
        name="propertyId"
        options={[
          { label: "All properties", value: "all" },
          ...propertyOptions.map((option) => ({
            label: option.label,
            value: option.id,
          })),
        ]}
      />
      <SelectControl
        ariaLabel="Unit"
        defaultValue={viewQuery.unitId}
        name="unitId"
        options={[
          { label: "All units", value: "all" },
          ...unitOptions.map((option) => ({
            label: option.label,
            value: option.id,
          })),
        ]}
      />
      <Input
        aria-label="Search income"
        defaultValue={viewQuery.query}
        name="query"
        placeholder="Search payer, ref, note"
      />
      <Button type="submit">Apply</Button>
    </form>
  );
}

function RentIncomeSummaryStrip({ summary }: { summary: RentIncomeSummary }) {
  return (
    <section aria-label="Global income summary" className="grid grid-flow-col auto-cols-[minmax(156px,1fr)] gap-3 overflow-x-auto border-b border-border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-6 lg:grid-flow-row lg:grid-cols-5 lg:auto-cols-auto" tabIndex={0}>
      <SummaryCard label="Expected" value={<MoneyDisplay value={summary.receivableTotal} />} />
      <SummaryCard label="Received" value={<MoneyDisplay value={summary.receivedTotal} />} />
      <SummaryCard label="Open rows" value={summary.openCount} />
      <SummaryCard label="Overdue" value={summary.overdueCount} />
      <SummaryCard label="Ready to post" value={summary.unpostedCount} />
    </section>
  );
}

function ScopedSummary({ label, totalCount }: { label: string; totalCount: number }) {
  return <section aria-label="Scoped income summary" className="border-b border-border px-4 py-3 sm:px-6"><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-muted">{totalCount} filtered {totalCount === 1 ? "row" : "rows"}</p></section>;
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

function RentIncomeTable({
  incomeItems,
  onSelectItem,
  selectedItemId,
}: {
  incomeItems: RentIncomeItem[];
  onSelectItem: (itemId: string) => void;
  selectedItemId: string;
}) {
  return (
    <div className="h-full overflow-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-[13px]">
        <thead className="border-b border-border bg-surface-muted text-[11px] uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="px-3 py-2">Payer</th>
            <th className="px-3 py-2">Property / Unit</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2 text-right">Expected</th>
            <th className="px-3 py-2 text-right">Received</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Next</th>
            <th className="w-[74px] px-3 py-2 text-right">Preview</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {incomeItems.map((item) => (
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
                <p className="font-medium">{item.payerLabel}</p>
                <p className="text-xs text-muted">{item.incomeTypeLabel}</p>
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
                <span className={item.isOverdue ? "font-semibold text-danger" : ""}>
                  {formatDate(item.dueDate)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-money-cell="true">
                <MoneyDisplay align="right" value={item.amountDueDisplay} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-money-cell="true">
                <MoneyDisplay align="right" value={item.amountReceivedDisplay} />
              </td>
              <td className="px-3 py-2">
                <StatusBadge item={item} />
              </td>
              <td className="px-3 py-2 text-xs text-muted">{item.nextAction}</td>
              <td className="px-3 py-2 text-right">
                <Button
                  aria-label={`Preview ${item.payerLabel}`}
                  aria-pressed={selectedItemId === item.id}
                  className="h-8 w-8 px-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectItem(item.id);
                  }}
                  title={`Preview ${item.payerLabel}`}
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

function RentIncomeInspector({
  item,
  onPost,
  onRecordPayment,
  onVoid,
}: {
  item: RentIncomeItem | null;
  onPost: (item: RentIncomeItem) => void;
  onRecordPayment: (item: RentIncomeItem) => void;
  onVoid: (item: RentIncomeItem) => void;
}) {
  if (!item) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4 text-sm text-muted">
        Select an income row to inspect payment, lease, and ledger context.
      </aside>
    );
  }

  const canRecordPayment =
    item.status === "open" || item.status === "partially_received";
  const canPost = item.status === "received" || item.status === "partially_received";
  const canVoid = item.status !== "posted";

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{item.payerLabel}</h2>
            <p className="mt-0.5 text-xs text-muted">{item.incomeTypeLabel}</p>
          </div>
          <StatusBadge item={item} />
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Detail label="Expected">
            <MoneyDisplay value={item.amountDueDisplay} />
          </Detail>
          <Detail label="Received">
            <MoneyDisplay value={item.amountReceivedDisplay} />
          </Detail>
          <Detail label="Balance">
            <MoneyDisplay value={item.balanceDisplay} />
          </Detail>
          <Detail label="Due">{formatDate(item.dueDate)}</Detail>
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
          {item.hrefs.lease ? (
            <Link className="block rounded-md border border-border px-3 py-2 hover:bg-surface-muted" href={item.hrefs.lease}>
              Lease record
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

        <div className="flex flex-wrap gap-2">
          {canRecordPayment ? (
            <Button onClick={() => onRecordPayment(item)}>
              <Coins size={15} />
              Record payment
            </Button>
          ) : null}
          {canPost ? (
            <Button onClick={() => onPost(item)} variant="primary">
              <Send size={15} />
              Post
            </Button>
          ) : null}
          {canVoid ? (
            <Button onClick={() => onVoid(item)} variant="ghost">
              <XCircle size={15} />
              Void
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function RentIncomeForm({
  leaseOptions,
  onClose,
  onSuccess,
  propertyOptions,
  unitOptions,
}: {
  leaseOptions: RentIncomeLeaseOption[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  propertyOptions: RentIncomeOption[];
  unitOptions: RentIncomeUnitOption[];
}) {
  const [state, action, pending] = useActionState(
    createRentIncomeItemAction,
    createInitialState,
  );

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <FormSection title="Income record">
          <Field label="Income type" error={state.fieldErrors?.incomeType?.[0]}>
            <SelectControl
              defaultValue="rent"
              name="incomeType"
              options={incomeTypeOptions.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              required
            />
          </Field>
          <Field label="Payer" error={state.fieldErrors?.payerLabel?.[0]}>
            <Input
              name="payerLabel"
              placeholder="Tenant, owner, or payer name"
              required
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
          <Field label="Lease" error={state.fieldErrors?.leaseId?.[0]}>
            <SelectControl
              name="leaseId"
              options={[
                { label: "No lease link", value: "" },
                ...leaseOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                })),
              ]}
            />
          </Field>
        </FormSection>

        <FormSection title="Dates and amount">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date" error={state.fieldErrors?.dueDate?.[0]}>
              <DatePickerField
                defaultValue={getBusinessDateValue()}
                name="dueDate"
                required
              />
            </Field>
            <Field
              label="Received date"
              error={state.fieldErrors?.receivedDate?.[0]}
            >
              <DatePickerField name="receivedDate" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expected" error={state.fieldErrors?.amountDue?.[0]}>
              <NumberInput name="amountDue" placeholder="0.00" required />
            </Field>
            <Field label="Received" error={state.fieldErrors?.amountReceived?.[0]}>
              <NumberInput name="amountReceived" placeholder="0.00" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Reference">
          <Field label="Reference" error={state.fieldErrors?.reference?.[0]}>
            <Input name="reference" placeholder="Receipt, transfer, invoice ref" />
          </Field>
          <Field label="Note" error={state.fieldErrors?.description?.[0]}>
            <Textarea name="description" rows={4} />
          </Field>
        </FormSection>

        {state.message ? <FormMessage state={state} /> : null}
      </div>
      <DrawerActions
        onCancel={onClose}
        pending={pending}
        submitLabel="Save income"
      />
    </form>
  );
}

function RecordPaymentPanel({
  item,
  onClose,
  onSuccess,
}: {
  item: RentIncomeItem;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    recordRentIncomePaymentAction,
    paymentInitialState,
  );

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <input name="incomeItemId" type="hidden" value={item.id} />
        <ConsequencePanel
          rows={[
            { label: "Receipt", value: item.payerLabel },
            { label: "Current balance", value: item.balanceDisplay.primary },
          ]}
          summary="Records dated cash received against this income item. Posting remains a separate action."
          title="Receipt consequence"
        />
        <FormSection title="Received money">
          <Field
            label="Received amount"
            error={state.fieldErrors?.amountReceived?.[0]}
          >
            <NumberInput
              defaultValue={String(
                Math.max(item.amountDue - item.amountReceived, 0),
              )}
              name="amountReceived"
              required
            />
          </Field>
          <Field
            label="Received date"
            error={state.fieldErrors?.receivedDate?.[0]}
          >
            <DatePickerField
              defaultValue={item.receivedDate ?? getBusinessDateValue()}
              name="receivedDate"
              required
            />
          </Field>
          <Field label="Reference" error={state.fieldErrors?.reference?.[0]}>
            <Input defaultValue={item.reference} name="reference" />
          </Field>
        </FormSection>
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

function PostIncomePanel({
  item,
  onClose,
  onSuccess,
}: {
  item: RentIncomeItem;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    postRentIncomeItemAction,
    postInitialState,
  );

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <input name="incomeItemId" type="hidden" value={item.id} />
        <ConsequencePanel
          rows={[
            { label: "Payer", value: item.payerLabel },
            { label: "Ledger amount", value: item.amountReceivedDisplay.primary },
            { label: "Result", value: "Official income ledger entry" },
          ]}
          summary="Creates the official income ledger entry for this received amount."
          title="Posting consequence"
        />
        {state.message ? <FormMessage state={state} /> : null}
      </div>
      <DrawerActions
        onCancel={onClose}
        pending={pending}
        submitLabel="Post to ledger"
      />
    </form>
  );
}

function VoidIncomePanel({
  item,
  onClose,
  onSuccess,
}: {
  item: RentIncomeItem;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    voidRentIncomeItemAction,
    voidInitialState,
  );

  useCloseOnSuccess(state, onClose, onSuccess);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <input name="incomeItemId" type="hidden" value={item.id} />
        <ConsequencePanel
          className="border-danger/30 bg-danger-soft"
          rows={[{ label: "Income record", value: item.payerLabel }]}
          summary="Removes this unposted row from the active income workflow. Posted income remains in the ledger."
          title="Void consequence"
        />
        {state.message ? <FormMessage state={state} /> : null}
      </div>
      <DrawerActions onCancel={onClose} pending={pending} submitLabel="Void row" />
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

function FormMessage({ state }: { state: RentIncomeActionState }) {
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

function Detail({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

function StatusBadge({ item }: { item: RentIncomeItem }) {
  return (
    <Badge
      tone={
        item.status === "posted"
          ? "success"
          : item.isOverdue
            ? "danger"
            : item.status === "received" || item.status === "partially_received"
              ? "warning"
              : "neutral"
      }
    >
      {item.isOverdue ? "Overdue" : item.statusLabel}
    </Badge>
  );
}

function useCloseOnSuccess(
  state: RentIncomeActionState,
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
    return "Add income";
  }

  if (drawer.mode === "payment") {
    return "Record received money";
  }

  if (drawer.mode === "post") {
    return "Post income";
  }

  return "Void income";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create expected rent, deposits, fees, reimbursements, owner contributions, or other income.";
  }

  if (drawer.mode === "payment") {
    return "Confirm received money before posting it to the ledger.";
  }

  if (drawer.mode === "post") {
    return "Posting creates the official income ledger entry.";
  }

  return "Voiding removes this row from the active income workflow.";
}
