"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarPlus,
  ExternalLink,
  FileText,
  Plus,
  Send,
  Wallet,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import {
  createPettyCashAccountAction,
  createPettyCashEntryAction,
  openNextPettyCashPeriodAction,
  postPettyCashEntryAction,
  type PettyCashActionState,
} from "@/features/petty-cash/actions";
import {
  economicScopeOptions,
  ownerBillStatusOptions,
} from "@/features/bills-expenses/bills-expenses.types";
import type {
  PettyCashAccount,
  PettyCashEntry,
  PettyCashPeriod,
  PettyCashPropertyOption,
  PettyCashSchemaStatus,
  PettyCashSummary,
  PettyCashUnitOption,
} from "@/features/petty-cash/petty-cash.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { buildHref } from "@/lib/url/href";
import { cn } from "@/lib/utils";

const accountInitialState: PettyCashActionState = {};
const entryInitialState: PettyCashActionState = {};
const openNextPeriodInitialState: PettyCashActionState = {};
const postInitialState: PettyCashActionState = {};

type DrawerState =
  | { mode: "account" }
  | { mode: "entry" }
  | { account: PettyCashAccount; mode: "rollover"; period: PettyCashPeriod; summary: PettyCashSummary }
  | { entry: PettyCashEntry; mode: "post" };

type PettyCashScreenProps = {
  accounts: PettyCashAccount[];
  entries: PettyCashEntry[];
  period: PettyCashPeriod | null;
  propertyOptions: PettyCashPropertyOption[];
  schemaStatus?: PettyCashSchemaStatus;
  selectedAccount?: PettyCashAccount;
  summary: PettyCashSummary;
  unitOptions: PettyCashUnitOption[];
};

export function PettyCashScreen({
  accounts,
  entries,
  period,
  propertyOptions,
  schemaStatus = { isReady: true },
  selectedAccount,
  summary,
  unitOptions,
}: PettyCashScreenProps) {
  const router = useRouter();
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;

  const openDrawer = (nextDrawer: DrawerState) => {
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PageHeader
        actions={
          !schemaStatus.isReady ? undefined : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openDrawer({ mode: "account" })}>
                <Wallet size={15} />
                Add account
              </Button>
              {selectedAccount && period ? (
                <>
                  <Button
                    onClick={() =>
                      openDrawer({
                        account: selectedAccount,
                        mode: "rollover",
                        period,
                        summary,
                      })
                    }
                  >
                    <CalendarPlus size={15} />
                    Open next month
                  </Button>
                  <Button
                    onClick={() => openDrawer({ mode: "entry" })}
                    variant="primary"
                  >
                    <Plus size={15} />
                    Add cash row
                  </Button>
                </>
              ) : null}
            </div>
          )
        }
        description="Track PM cash advances, receipt clearing, and ledger posting without turning the register into a second ledger."
        title="Petty Cash"
      />

      {statusMessage ? (
        <div className="border-b border-border bg-surface-muted/35 px-4 py-2 sm:px-6">
          <p className="text-[13px]" role="status">
            {statusMessage}
          </p>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
        <PettyCashSummaryStrip
          account={selectedAccount}
          accounts={accounts}
          onSelectAccount={(accountId) =>
            router.replace(buildHref("/petty-cash", { accountId }))
          }
          period={period}
          summary={summary}
        />

        {selectedAccount && period ? (
          <main className="grid min-h-0 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-h-0 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Petty cash register</h2>
                  <p className="mt-0.5 text-[13px] text-muted">
                    Select a row to inspect. Posted rows are linked to the ledger.
                  </p>
                </div>
                <Badge>{entries.length} rows</Badge>
              </div>
              <PettyCashTable
                entries={entries}
                onSelectEntry={setSelectedEntryId}
                selectedEntryId={selectedEntry?.id ?? ""}
              />
            </section>

            <PettyCashInspector
              entry={selectedEntry}
              onPost={(entry) => openDrawer({ entry, mode: "post" })}
              period={period}
            />
          </main>
        ) : (
          <EmptyPettyCashState
            message={schemaStatus.message}
            onCreate={
              schemaStatus.isReady
                ? () => openDrawer({ mode: "account" })
                : undefined
            }
            title={
              schemaStatus.isReady
                ? "Create a petty cash account"
                : "Petty cash is not available"
            }
          />
        )}
      </div>

      {drawerState ? (
        <SideDrawer
          description={getDrawerDescription(drawerState)}
          onClose={() => setDrawerState(null)}
          open
          title={getDrawerTitle(drawerState)}
        >
          {drawerState.mode === "account" ? (
            <PettyCashAccountForm
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "post" ? (
            <PostPettyCashPanel
              entry={drawerState.entry}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "rollover" ? (
            <OpenNextPeriodPanel
              account={drawerState.account}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              period={drawerState.period}
              summary={drawerState.summary}
            />
          ) : (
            <PettyCashEntryForm
              account={selectedAccount}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              period={period}
              properties={propertyOptions}
              units={unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}
    </div>
  );
}

function PettyCashSummaryStrip({
  account,
  accounts,
  onSelectAccount,
  period,
  summary,
}: {
  account?: PettyCashAccount;
  accounts: PettyCashAccount[];
  onSelectAccount: (accountId: string) => void;
  period: PettyCashPeriod | null;
  summary: PettyCashSummary;
}) {
  return (
    <section className="border-b border-border bg-surface-muted/35 px-4 py-3 sm:px-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_repeat(6,minmax(106px,1fr))]">
        <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Account
          </p>
          {accounts.length > 0 && account ? (
            <SelectControl
              ariaLabel="Petty cash account"
              className="mt-1"
              onValueChange={onSelectAccount}
              options={accounts.map((option) => ({
                label: `${option.accountNumber} / ${option.name}`,
                value: option.id,
              }))}
              value={account.id}
            />
          ) : (
            <p className="mt-1 truncate text-sm font-semibold">No account</p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {period
              ? `${formatDate(period.periodStart)} period / ${period.status}`
              : `${accounts.length} configured accounts`}
          </p>
        </div>
        <MetricCard label="Opening float" value={summary.openingFloat.primary} />
        <MetricCard label="Cash in" value={summary.cashIn.primary} />
        <MetricCard label="Cash out" value={summary.cashOut.primary} />
        <MetricCard label="Balance" value={summary.balance.primary} />
        <MetricCard label="Ready" value={summary.readyToPostCount} />
        <MetricCard label="Missing receipts" value={summary.receiptMissingCount} />
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PettyCashTable({
  entries,
  onSelectEntry,
  selectedEntryId,
}: {
  entries: PettyCashEntry[];
  onSelectEntry: (id: string) => void;
  selectedEntryId: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[min(620px,calc(100vh-310px))] overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[112px]" />
            <col className="w-[118px]" />
            <col className="w-[140px]" />
            <col />
            <col className="w-[118px]" />
            <col className="w-[118px]" />
            <col className="w-[96px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Property / Unit</th>
              <th className="px-3 py-2.5 font-semibold">Supplier / Description</th>
              <th className="px-3 py-2.5 text-right font-semibold">Movement</th>
              <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={7}>
                  No petty cash rows yet.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus:bg-surface-muted focus:outline-none",
                  selectedEntryId === entry.id &&
                    "bg-surface-muted shadow-[inset_3px_0_0_var(--accent)]",
                )}
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEntry(entry.id);
                  }
                }}
                tabIndex={0}
              >
                <td className="whitespace-nowrap px-3 py-2">
                  <p className="text-muted">{formatDate(entry.invoiceDate)}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {entry.clearDate
                      ? `Clear ${formatDate(entry.clearDate)}`
                      : "Not cleared"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <EntryKindBadge entry={entry} />
                  {entry.entryKind === "expense" &&
                  entry.economicScope !== "property_expense" ? (
                    <p className="mt-1 truncate text-xs text-muted">
                      {entry.economicScopeLabel}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <p className="truncate font-medium">
                    {entry.propertyCode ?? "Cash account"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {entry.unitNumber ? `Unit ${entry.unitNumber}` : "Property level"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <p className="truncate font-medium">
                    {entry.supplier ?? entry.category}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {entry.description}
                  </p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoneyDisplay(
                    entry.outAmount > 0 ? -entry.outAmount : entry.inAmount,
                    entry.currency,
                  ).primary}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoneyDisplay(entry.balanceAfter, entry.currency).primary}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={entry.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PettyCashInspector({
  entry,
  onPost,
  period,
}: {
  entry: PettyCashEntry | null;
  onPost: (entry: PettyCashEntry) => void;
  period: PettyCashPeriod;
}) {
  if (!entry) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">No row selected</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Select a cash row to inspect receipt readiness and ledger status.
        </p>
      </aside>
    );
  }

  const canPost =
    entry.entryKind === "expense" &&
    entry.status !== "posted" &&
    entry.status !== "void";

  return (
    <aside className="min-h-0 overflow-hidden rounded-md border border-border bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              {entry.entryKind === "expense" ? "Cash expense" : "Cash movement"}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold">
              {entry.category}
            </h2>
          </div>
          <StatusBadge status={entry.status} />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{entry.description}</p>
        <div className="mt-4">
          <MoneyDisplay
            size="large"
            value={formatMoneyDisplay(
              entry.outAmount > 0 ? -entry.outAmount : entry.inAmount,
              entry.currency,
            )}
          />
        </div>
      </div>

      <div className="space-y-3 p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <CompactFact label="Supplier">
            {entry.supplier ?? "Not recorded"}
          </CompactFact>
          <CompactFact label="Period">{formatDate(period.periodStart)}</CompactFact>
          <CompactFact label="Property">
            {entry.propertyId ? (
              <Link
                className="line-clamp-2 text-accent hover:underline"
                href={`/properties/${entry.propertyId}`}
              >
                {entry.propertyCode}
              </Link>
            ) : (
              "Cash account"
            )}
          </CompactFact>
          <CompactFact label="Unit">
            {entry.unitId ? (
              <Link
                className="line-clamp-2 text-accent hover:underline"
                href={`/units/${entry.unitId}`}
              >
                Unit {entry.unitNumber}
              </Link>
            ) : (
              "Property level"
            )}
          </CompactFact>
        </div>

        {entry.entryKind === "expense" ? (
          <div className="rounded-md border border-border bg-surface-muted/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">
                {entry.receiptReference ? "Receipt referenced" : "Receipt missing"}
              </p>
              <Badge tone={entry.receiptReference ? "success" : "warning"}>
                {entry.receiptReference ? "Ready" : "Review"}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              {entry.receiptReference ??
                "Add the receipt or invoice number before month-end clearing."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface-muted/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Reconciliation movement</p>
              <Badge tone="success">Cash in</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              Advances and cash-in rows support the cash balance but do not post
              as income.
            </p>
          </div>
        )}

        {entry.entryKind === "expense" ? (
          <div className="rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{entry.economicScopeLabel}</p>
              <Badge
                tone={
                  entry.economicScope === "company_advance"
                    ? "warning"
                    : entry.economicScope === "company_cost"
                      ? "danger"
                      : "neutral"
                }
              >
                {entry.ownerBillStatusLabel}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              {entry.economicScope === "company_advance"
                ? `${entry.ownerReceivable.primary} still receivable from owner.`
                : entry.economicScope === "company_cost"
                  ? "This cash spend reduces company P&L."
                  : "This remains ordinary property expense handling."}
            </p>
          </div>
        ) : null}

        {entry.ledgerEntryId ? (
          <Link
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm hover:bg-surface-muted"
            href={`/ledger?archiveState=all&entryId=${entry.ledgerEntryId}`}
          >
            <ExternalLink size={14} />
            Open ledger entry
          </Link>
        ) : canPost ? (
          <Button className="w-full" onClick={() => onPost(entry)} variant="primary">
            <Send size={14} />
            Post to ledger
          </Button>
        ) : (
          <div className="rounded-md border border-border px-3 py-2.5 text-sm text-muted">
            This row stays in petty cash reconciliation and does not post to
            financial reports.
          </div>
        )}
      </div>
    </aside>
  );
}

function PettyCashAccountForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    createPettyCashAccountAction,
    accountInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Petty cash account created.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <Field label="Account number" error={state.fieldErrors?.accountNumber?.[0]}>
          <Input name="accountNumber" placeholder="PM-CASH-01" required />
        </Field>
        <Field label="Account name" error={state.fieldErrors?.name?.[0]}>
          <Input name="name" placeholder="Office petty cash" required />
        </Field>
        <Field label="Float / advance amount" error={state.fieldErrors?.floatAmount?.[0]}>
          <NumberInput min="0" name="floatAmount" placeholder="0.00" step="0.01" />
        </Field>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs leading-5 text-muted">
          This creates the account and opens the current month with the opening
          float amount.
        </p>
        <FormMessage state={state} />
      </div>
      <DrawerFooter
        disabled={pending}
        onClose={onClose}
        submitLabel={pending ? "Creating..." : "Create account"}
      />
    </form>
  );
}

function PettyCashEntryForm({
  account,
  onClose,
  onSuccess,
  period,
  properties,
  units,
}: {
  account?: PettyCashAccount;
  onClose: () => void;
  onSuccess: (message: string) => void;
  period: PettyCashPeriod | null;
  properties: PettyCashPropertyOption[];
  units: PettyCashUnitOption[];
}) {
  const [entryKind, setEntryKind] = useState("expense");
  const [economicScope, setEconomicScope] = useState("property_expense");
  const [ownerBillStatus, setOwnerBillStatus] = useState("not_billable");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [state, action, pending] = useActionState(
    createPettyCashEntryAction,
    entryInitialState,
  );
  const availableUnits = useMemo(
    () => units.filter((unit) => unit.propertyId === selectedPropertyId),
    [selectedPropertyId, units],
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Petty cash row added.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  if (!account || !period) {
    return (
      <div className="p-5 text-sm text-muted">
        Create a petty cash account before adding rows.
      </div>
    );
  }

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="accountId" type="hidden" value={account.id} />
      <input name="periodId" type="hidden" value={period.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Movement" error={state.fieldErrors?.entryKind?.[0]}>
            <SelectControl
              ariaLabel="Movement"
              name="entryKind"
              onValueChange={setEntryKind}
              options={[
                { label: "Expense", value: "expense" },
                { label: "PM advance", value: "advance" },
                { label: "Cash returned / top-up", value: "cash_in" },
              ]}
              value={entryKind}
            />
          </Field>
          <Field label="Status" error={state.fieldErrors?.status?.[0]}>
            <SelectControl
              ariaLabel="Status"
              defaultValue="draft"
              name="status"
              options={[
                { label: "Draft", value: "draft" },
                { label: "Cleared", value: "cleared" },
              ]}
            />
          </Field>
          <Field label="Invoice date" error={state.fieldErrors?.invoiceDate?.[0]}>
            <DatePickerField
              defaultValue={getBusinessDateValue()}
              name="invoiceDate"
              required
            />
          </Field>
          <Field label="Clear date" error={state.fieldErrors?.clearDate?.[0]}>
            <DatePickerField name="clearDate" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
            <SelectControl
              ariaLabel="Property"
              name="propertyId"
              onValueChange={setSelectedPropertyId}
              options={[
                {
                  disabled: entryKind === "expense",
                  label:
                    entryKind === "expense"
                      ? "Select property"
                      : "Cash account only",
                  value: "",
                },
                ...properties.map((property) => ({
                  label: property.label,
                  value: property.id,
                })),
              ]}
              required={entryKind === "expense"}
              value={selectedPropertyId}
            />
          </Field>
          <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
            <SelectControl
              ariaLabel="Unit"
              disabled={!selectedPropertyId}
              name="unitId"
              options={[
                { label: "Property level", value: "" },
                ...availableUnits.map((unit) => ({
                  label: unit.label,
                  value: unit.id,
                })),
              ]}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Field label="Category" error={state.fieldErrors?.category?.[0]}>
            <Input
              name="category"
              placeholder={entryKind === "expense" ? "Repairs, cleaning" : "Advance PM"}
              required
            />
          </Field>
          <Field label="Amount" error={state.fieldErrors?.amount?.[0]}>
            <NumberInput min="0.01" name="amount" placeholder="0.00" required />
          </Field>
        </div>

        <Field label="Supplier" error={state.fieldErrors?.supplier?.[0]}>
          <Input name="supplier" placeholder="Supplier or staff name" />
        </Field>
        <Field label="Description" error={state.fieldErrors?.description?.[0]}>
          <Textarea
            name="description"
            placeholder="What was paid for, or why cash came in"
            required
          />
        </Field>
        <Field
          label="Receipt / invoice reference"
          error={state.fieldErrors?.receiptReference?.[0]}
        >
          <Input name="receiptReference" placeholder="Receipt number or file note" />
        </Field>

        {entryKind === "expense" ? (
          <section className="rounded-md border border-border bg-surface-muted/45 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Company / owner handling</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Use this when the company pays cash first and owner billing or
                  company cost needs tracking.
                </p>
              </div>
              <Badge tone={economicScope === "company_advance" ? "warning" : "neutral"}>
                {economicScope === "company_advance"
                  ? "Owner receivable"
                  : economicScope === "company_cost"
                    ? "Company cost"
                    : "Property expense"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="Handling"
                error={state.fieldErrors?.economicScope?.[0]}
              >
                <SelectControl
                  ariaLabel="Company handling"
                  name="economicScope"
                  onValueChange={(value) => {
                    setEconomicScope(value);
                    setOwnerBillStatus(
                      value === "company_advance" ? "billable" : "not_billable",
                    );
                  }}
                  options={[...economicScopeOptions]}
                  value={economicScope}
                />
              </Field>
              <Field
                label="Owner bill status"
                error={state.fieldErrors?.ownerBillStatus?.[0]}
              >
                <SelectControl
                  ariaLabel="Owner bill status"
                  disabled={economicScope !== "company_advance"}
                  name="ownerBillStatus"
                  onValueChange={setOwnerBillStatus}
                  options={[...ownerBillStatusOptions]}
                  value={ownerBillStatus}
                />
              </Field>
              <Field
                label="Billable to owner"
                error={state.fieldErrors?.ownerReimbursableAmount?.[0]}
              >
                <NumberInput
                  disabled={economicScope !== "company_advance"}
                  min="0"
                  name="ownerReimbursableAmount"
                  placeholder="Defaults to amount"
                  step="0.01"
                />
              </Field>
              <Field
                label="Owner reimbursed"
                error={state.fieldErrors?.ownerReimbursedAmount?.[0]}
              >
                <NumberInput
                  disabled={economicScope !== "company_advance"}
                  min="0"
                  name="ownerReimbursedAmount"
                  placeholder="0.00"
                  step="0.01"
                />
              </Field>
              <Field
                label="Company loss"
                error={state.fieldErrors?.companyLossAmount?.[0]}
              >
                <NumberInput
                  disabled={economicScope === "property_expense"}
                  min="0"
                  name="companyLossAmount"
                  placeholder={
                    economicScope === "company_cost" ? "Defaults to amount" : "0.00"
                  }
                  step="0.01"
                />
              </Field>
            </div>
          </section>
        ) : null}
        <Field label="Remark" error={state.fieldErrors?.remark?.[0]}>
          <Textarea name="remark" placeholder="Clearing note or exception" />
        </Field>
        <FormMessage state={state} />
      </div>
      <DrawerFooter
        disabled={pending}
        onClose={onClose}
        submitLabel={pending ? "Adding..." : "Add cash row"}
      />
    </form>
  );
}

function PostPettyCashPanel({
  entry,
  onClose,
  onSuccess,
}: {
  entry: PettyCashEntry;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    postPettyCashEntryAction,
    postInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Petty cash expense posted to ledger.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="entryId" type="hidden" value={entry.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-semibold">{entry.category}</p>
          <p className="mt-1 text-sm text-muted">
            {entry.propertyCode}
            {entry.unitNumber ? ` / Unit ${entry.unitNumber}` : " / Property"}
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums">
            {formatMoneyDisplay(entry.outAmount, entry.currency).primary}
          </p>
        </div>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm leading-6 text-muted">
          Posting creates one ledger expense and the linked timeline event. Cash
          advances are not posted because they are reconciliation movement, not
          property income.
        </p>
        <FormMessage state={state} />
      </div>
      <DrawerFooter
        disabled={pending}
        onClose={onClose}
        submitLabel={pending ? "Posting..." : "Post to ledger"}
      />
    </form>
  );
}

function OpenNextPeriodPanel({
  account,
  onClose,
  onSuccess,
  period,
  summary,
}: {
  account: PettyCashAccount;
  onClose: () => void;
  onSuccess: (message: string) => void;
  period: PettyCashPeriod;
  summary: PettyCashSummary;
}) {
  const [state, action, pending] = useActionState(
    openNextPettyCashPeriodAction,
    openNextPeriodInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Next petty cash month opened.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="accountId" type="hidden" value={account.id} />
      <input name="periodId" type="hidden" value={period.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-semibold">
            {formatDate(period.periodStart)} close balance
          </p>
          <p className="mt-2 text-sm font-semibold tabular-nums">
            {summary.balance.primary}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            This closes the current month and carries this balance into the next
            month.
          </p>
        </div>
        <Field label="Next advance amount" error={state.fieldErrors?.advanceAmount?.[0]}>
          <NumberInput
            min="0"
            name="advanceAmount"
            placeholder="Auto top up to target float"
            step="0.01"
          />
        </Field>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs leading-5 text-muted">
          Leave blank to top up toward the account float of{" "}
          {formatMoneyDisplay(account.floatAmount, account.currency).primary}.
        </p>
        <FormMessage state={state} />
      </div>
      <DrawerFooter
        disabled={pending}
        onClose={onClose}
        submitLabel={pending ? "Opening..." : "Open next month"}
      />
    </form>
  );
}

function EmptyPettyCashState({
  message,
  onCreate,
  title,
}: {
  message?: string;
  onCreate?: () => void;
  title: string;
}) {
  return (
    <main className="flex min-h-0 items-start px-4 py-5 sm:px-6">
      <div className="w-full rounded-md border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-muted">
            <Wallet size={17} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              {message ??
                "IPS tracks petty cash as an operating register: advance, expense, receipt, clearing, balance, then ledger posting for real expenses."}
            </p>
            {onCreate ? (
              <Button className="mt-4" onClick={onCreate} variant="primary">
                <Plus size={15} />
                Create account
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function CompactFact({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 min-w-0 font-medium">{children}</div>
    </div>
  );
}

function EntryKindBadge({ entry }: { entry: PettyCashEntry }) {
  if (entry.entryKind === "expense") {
    return (
      <Badge tone="warning">
        <ArrowDownCircle size={12} />
        Expense
      </Badge>
    );
  }

  return (
    <Badge tone="success">
      <ArrowUpCircle size={12} />
      {entry.entryKind === "advance" ? "Advance" : "Cash in"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: PettyCashEntry["status"] }) {
  const tone =
    status === "posted"
      ? "success"
      : status === "void"
        ? "danger"
        : status === "cleared"
          ? "accent"
          : "neutral";

  return <Badge tone={tone}>{statusLabels[status]}</Badge>;
}

const statusLabels: Record<PettyCashEntry["status"], string> = {
  cleared: "Cleared",
  draft: "Draft",
  posted: "Posted",
  void: "Void",
};

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function FormMessage({ state }: { state: PettyCashActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function DrawerFooter({
  disabled,
  onClose,
  submitLabel,
}: {
  disabled: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="border-t border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={disabled}
          type="submit"
          variant="primary"
        >
          <FileText size={15} />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "account") {
    return "Create petty cash account";
  }

  if (drawer.mode === "post") {
    return "Post to ledger";
  }

  if (drawer.mode === "rollover") {
    return "Open next month";
  }

  return "Add petty cash row";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "account") {
    return "Start the IPS-style PM cash register.";
  }

  if (drawer.mode === "post") {
    return "Create the official ledger expense for this cash-out row.";
  }

  if (drawer.mode === "rollover") {
    return "Close this period and carry its cash balance forward.";
  }

  return "Record the cash movement first; post expenses to the ledger after review.";
}
