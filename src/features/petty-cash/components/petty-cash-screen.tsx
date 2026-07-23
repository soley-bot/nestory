"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarPlus,
  Eye,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Send,
  ShieldX,
  Wallet,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SearchableSelectControl } from "@/components/ui/searchable-select-control";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import {
  createPettyCashAccountAction,
  createPettyCashEntryAction,
  openNextPettyCashPeriodAction,
  postPettyCashEntryAction,
  updatePettyCashEntryAction,
  voidPettyCashEntryAction,
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
import {
  PERSON_SELECT_EXTERNAL_VALUE,
  PersonSelect,
} from "@/features/people/components/person-select";
import type { PersonSelectOption } from "@/features/people/person-select";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { buildHref } from "@/lib/url/href";
import { cn } from "@/lib/utils";

const accountInitialState: PettyCashActionState = {};
const entryInitialState: PettyCashActionState = {};
const openNextPeriodInitialState: PettyCashActionState = {};
const postInitialState: PettyCashActionState = {};
const voidInitialState: PettyCashActionState = {};

type DrawerState =
  | { mode: "account" }
  | { mode: "entry" }
  | { entry: PettyCashEntry; mode: "edit" }
  | { entry: PettyCashEntry; mode: "void" }
  | { account: PettyCashAccount; mode: "rollover"; period: PettyCashPeriod; summary: PettyCashSummary }
  | { entry: PettyCashEntry; mode: "post" };

type PettyCashScreenProps = {
  accounts: PettyCashAccount[];
  counterpartyOptions: PersonSelectOption[];
  entries: PettyCashEntry[];
  focusedEntryId?: string;
  focusState?: "available" | "none" | "unavailable";
  period: PettyCashPeriod | null;
  propertyOptions: PettyCashPropertyOption[];
  schemaStatus?: PettyCashSchemaStatus;
  selectedAccount?: PettyCashAccount;
  summary: PettyCashSummary;
  staffOptions: PersonSelectOption[];
  unitOptions: PettyCashUnitOption[];
};

export function PettyCashScreen({
  accounts,
  counterpartyOptions,
  entries,
  focusedEntryId,
  focusState = focusedEntryId ? "available" : "none",
  period,
  propertyOptions,
  schemaStatus = { isReady: true },
  selectedAccount,
  summary,
  staffOptions,
  unitOptions,
}: PettyCashScreenProps) {
  const router = useRouter();
  const hasFocusedEntry = focusState !== "none" && Boolean(focusedEntryId);
  const focusedEntry =
    focusState === "available"
      ? entries.find((entry) => entry.id === focusedEntryId) ?? null
      : null;
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState(
    focusedEntry?.id ?? (hasFocusedEntry ? "" : entries[0]?.id) ?? "",
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(
    Boolean(focusedEntry),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ??
    (hasFocusedEntry ? null : entries[0]) ??
    null;
  const canAddEntry =
    selectedAccount?.status === "active" && period?.status === "open";

  const openDrawer = (nextDrawer: DrawerState) => {
    setCompactInspectorOpen(false);
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };

  const previewEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setCompactInspectorOpen(true);
  };

  const registerList = selectedAccount && period ? (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {entries.length === 0 ? (
        <EmptyState
          action={
            canAddEntry ? (
            <Button onClick={() => openDrawer({ mode: "entry" })} variant="primary">
              <Plus size={15} />
              Add cash row
            </Button>
            ) : undefined
          }
          body="Record the first advance, cash-in movement, or expense."
          className="h-full"
          kind="empty"
          title="No petty cash rows yet"
        />
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold">Petty cash register</h2>
            <Badge>{entries.length} rows</Badge>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <PettyCashTable
              entries={entries}
              onSelectEntry={previewEntry}
              selectedEntryId={compactInspectorOpen ? selectedEntry?.id ?? "" : ""}
            />
          </div>
        </>
      )}
    </section>
  ) : null;
  const cashInspector = selectedAccount && selectedEntry && period ? (
    <PettyCashInspector
      account={selectedAccount}
      entry={selectedEntry}
      onEdit={(entry) => openDrawer({ entry, mode: "edit" })}
      onPost={(entry) => openDrawer({ entry, mode: "post" })}
      onVoid={(entry) => openDrawer({ entry, mode: "void" })}
      period={period}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        !schemaStatus.isReady ? undefined : (
          <div className="flex flex-wrap gap-2">
              <Button onClick={() => openDrawer({ mode: "account" })}>
                <Wallet size={15} />
                Add account
              </Button>
              {selectedAccount?.status === "active" && period ? (
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
                  {canAddEntry ? (
                    <Button
                      onClick={() => openDrawer({ mode: "entry" })}
                      variant="primary"
                    >
                      <Plus size={15} />
                      Add cash row
                    </Button>
                  ) : null}
                </>
              ) : null}
          </div>
        )
      }
      context={selectedAccount ? `${selectedAccount.accountNumber} / ${selectedAccount.name}` : "Cash register"}
      contextHref="/petty-cash"
      localNav={<FinanceWorkspaceNavigation activeRoute="/petty-cash" />}
      title="Petty Cash"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">

      {statusMessage ? (
        <div className="border-b border-border bg-surface-muted/35 px-4 py-2 sm:px-6">
          <p className="text-[13px]" role="status">
            {statusMessage}
          </p>
        </div>
      ) : null}

      {hasFocusedEntry ? (
        <FocusedRecordContext
          clearHref={buildHref("/petty-cash", {
            accountId: selectedAccount?.id,
          })}
          isArchived={Boolean(focusedEntry?.archivedAt)}
          isAvailable={Boolean(focusedEntry)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
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
          <div className="min-h-0 min-w-0 flex-1">
            {cashInspector && registerList ? (
              <WorkspaceSplitView
                inspector={cashInspector}
                inspectorLabel={`${selectedEntry?.category ?? "Petty cash"} cash quick view`}
                inspectorOpen={compactInspectorOpen}
                list={registerList}
                onInspectorOpenChange={setCompactInspectorOpen}
              />
            ) : registerList ? (
              <WorkspaceSplitView list={registerList} />
            ) : null}
          </div>
        ) : (
          <EmptyState
            action={
              schemaStatus.isReady ? (
                <Button onClick={() => openDrawer({ mode: "account" })} variant="primary">
                  <Plus size={15} />
                  Add account
                </Button>
              ) : undefined
            }
            body={
              schemaStatus.isReady
                ? "Add the first petty cash account and opening float."
                : schemaStatus.message ?? "Petty cash is not configured for this workspace."
            }
            className="h-full"
            kind={schemaStatus.isReady ? "empty" : "permission"}
            title={schemaStatus.isReady ? "No petty cash account yet" : "Petty cash unavailable"}
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
              staffOptions={staffOptions}
            />
          ) : drawerState.mode === "post" ? (
            <PostPettyCashPanel
              entry={drawerState.entry}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "void" ? (
            <VoidPettyCashPanel
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
              counterpartyOptions={counterpartyOptions}
              entry={drawerState.mode === "edit" ? drawerState.entry : undefined}
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
    </WorkspacePage>
  );
}

function FocusedRecordContext({
  clearHref,
  isArchived,
  isAvailable,
}: {
  clearHref: string;
  isArchived: boolean;
  isAvailable: boolean;
}) {
  return (
    <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted/45 px-4 py-2 sm:px-6">
      <div>
        <p className="text-sm font-medium">
          {isAvailable ? "Focused from activity history" : "Source record unavailable"}
        </p>
        <p className="text-xs text-muted">
          {isAvailable
            ? isArchived
              ? "Archived source record"
              : "The exact Petty Cash row is open for review."
            : "The record does not exist or you no longer have access."}
        </p>
      </div>
      <Link
        aria-label="Clear focused record"
        className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium hover:bg-surface-muted"
        href={clearHref}
      >
        Clear focus
      </Link>
    </section>
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
    <section aria-label="Petty cash summary" className="overflow-x-auto border-b border-border bg-surface-muted/35 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-6" tabIndex={0}>
      <div className="grid min-w-[1120px] grid-cols-[minmax(220px,1.6fr)_repeat(8,minmax(96px,1fr))] gap-3 xl:min-w-0">
        <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Account
          </p>
          {accounts.length > 0 && account ? (
            <SearchableSelectControl
              ariaLabel="Petty cash account"
              className="mt-1"
              onValueChange={onSelectAccount}
              options={accounts.map((option) => ({
                description: [
                  option.name,
                  option.custodianName
                    ? `Custodian: ${option.custodianName}`
                    : "No custodian",
                ].join(" / "),
                label: option.accountNumber,
                meta: option.status,
                searchText: `${option.accountNumber} ${option.name} ${option.custodianName ?? ""} ${option.status}`,
                value: option.id,
              }))}
              value={account.id}
            />
          ) : (
            <p className="mt-1 truncate text-sm font-semibold">No account</p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {period && account
             ? `${formatDate(period.periodStart)} period / ${period.status} / ${account.custodianName ?? "No custodian"}`
              : `${accounts.length} configured accounts`}
          </p>
        </div>
        <MetricCard label="Opening cash" value={summary.openingFloat.primary} />
        <MetricCard label="Cash in" value={summary.cashIn.primary} />
        <MetricCard label="Cash out" value={summary.cashOut.primary} />
        <MetricCard label="Balance" value={summary.balance.primary} />
        <MetricCard label="Posted" value={summary.postedCount} />
        <MetricCard label="Ready" value={summary.readyToPostCount} />
        <MetricCard label="Missing receipts" value={summary.receiptMissingCount} />
        <MetricCard label="Voids" value={summary.voidCount} />
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
        <table className="w-full min-w-[840px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[112px]" />
            <col className="w-[118px]" />
            <col className="w-[140px]" />
            <col />
            <col className="w-[118px]" />
            <col className="w-[118px]" />
            <col className="w-[96px]" />
            <col className="w-[74px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Property / Unit</th>
              <th className="px-3 py-2.5 font-semibold">Counterparty / Description</th>
              <th className="px-3 py-2.5 text-right font-semibold">Movement</th>
              <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={8}>
                  No petty cash rows yet.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus-visible:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  selectedEntryId === entry.id &&
                    "bg-surface-muted shadow-[inset_3px_0_0_var(--accent)]",
                )}
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEntry(entry.id);
                  }
                }}
                tabIndex={0}
                aria-selected={selectedEntryId === entry.id}
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
                  {entry.propertyId ? (
                    <Link
                      className="block truncate font-medium text-accent hover:underline"
                      href={`/properties/${entry.propertyId}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {entry.propertyCode}
                    </Link>
                  ) : (
                    <p className="truncate font-medium">Cash account</p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {entry.unitNumber ? `Unit ${entry.unitNumber}` : "Property level"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <p className="truncate font-medium">
                    {entry.supplier ?? entry.category}
                  </p>
                  {entry.counterpartyPersonId ? (
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      Linked person
                      {entry.counterpartyCurrentName &&
                      entry.counterpartyCurrentName !== entry.supplier
                        ? ` · now ${entry.counterpartyCurrentName}`
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {entry.description}
                  </p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-money-cell="true">
                  <span className={entry.status === "void" ? "line-through text-muted" : ""}>
                    {formatMoneyDisplay(
                      entry.outAmount > 0 ? -entry.outAmount : entry.inAmount,
                      entry.currency,
                    ).primary}
                  </span>
                  {entry.status === "void" ? (
                    <span className="mt-0.5 block text-[11px] text-muted">No impact</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-money-cell="true">
                  {formatMoneyDisplay(entry.balanceAfter, entry.currency).primary}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={entry.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    aria-label={`Preview ${entry.category}`}
                    aria-pressed={selectedEntryId === entry.id}
                    className="h-8 w-8 px-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEntry(entry.id);
                    }}
                    title={`Preview ${entry.category}`}
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
    </div>
  );
}

function PettyCashInspector({
  account,
  entry,
  onEdit,
  onPost,
  onVoid,
  period,
}: {
  account: PettyCashAccount;
  entry: PettyCashEntry | null;
  onEdit: (entry: PettyCashEntry) => void;
  onPost: (entry: PettyCashEntry) => void;
  onVoid: (entry: PettyCashEntry) => void;
  period: PettyCashPeriod;
}) {
  if (!entry) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Petty cash row</h2>
      </aside>
    );
  }

  const canPost =
    !entry.archivedAt &&
    account.status === "active" &&
    entry.entryKind === "expense" &&
    entry.status !== "posted" &&
    entry.status !== "void" &&
    period.status !== "closed";
  const canCorrect =
    !entry.archivedAt &&
    account.status === "active" &&
    (entry.status === "draft" || entry.status === "cleared") &&
    !entry.ledgerEntryId &&
    period.status !== "closed";

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
          <CompactFact label="Counterparty">
            {entry.counterpartyPersonId ? (
              <Link
                className="line-clamp-2 text-accent hover:underline"
                href={`/people/${entry.counterpartyPersonId}`}
              >
                {entry.supplier ?? entry.counterpartyCurrentName ?? "Linked person"}
              </Link>
            ) : (
              entry.supplier ?? "Not recorded"
            )}
          </CompactFact>
          <CompactFact label="Period">{formatDate(period.periodStart)}</CompactFact>
          <CompactFact label="Account">
            {account.accountNumber} · {account.name}
          </CompactFact>
          <CompactFact label="Cash impact">
            {entry.status === "void"
              ? "Zero · original retained"
              : formatMoneyDisplay(
                  entry.outAmount > 0 ? -entry.outAmount : entry.inAmount,
                  entry.currency,
                ).primary}
          </CompactFact>
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

        {entry.voidReason ? (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5">
            <p className="font-semibold text-danger">Voided</p>
            <p className="mt-1 text-xs leading-5 text-muted">{entry.voidReason}</p>
            {entry.voidedAt ? (
              <p className="mt-1 text-[11px] text-muted">
                {formatDate(entry.voidedAt)}
              </p>
            ) : null}
          </div>
        ) : null}

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
        ) : canCorrect || canPost ? (
          <div className="grid gap-2">
            {canPost ? (
              <Button className="w-full" onClick={() => onPost(entry)} variant="primary">
                <Send size={14} />
                Post to ledger
              </Button>
            ) : null}
            {canCorrect ? (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => onEdit(entry)}>
                  <Pencil size={14} />
                  Edit
                </Button>
                <Button onClick={() => onVoid(entry)}>
                  <ShieldX size={14} />
                  Void
                </Button>
              </div>
            ) : null}
          </div>
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
  staffOptions,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  staffOptions: PersonSelectOption[];
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
        <Field label="Custodian (optional)" error={state.fieldErrors?.custodianPersonId?.[0]}>
          <PersonSelect
            allowClear
            context="Petty cash custodian"
            name="custodianPersonId"
            options={staffOptions}
            placeholder="Search active Staff"
            roles={["staff"]}
          />
        </Field>
        <ConsequencePanel
          summary="Creates the cash account and opens the current month with its opening float."
          title="Opening-float consequence"
        />
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
  counterpartyOptions,
  entry,
  onClose,
  onSuccess,
  period,
  properties,
  units,
}: {
  account?: PettyCashAccount;
  counterpartyOptions: PersonSelectOption[];
  entry?: PettyCashEntry;
  onClose: () => void;
  onSuccess: (message: string) => void;
  period: PettyCashPeriod | null;
  properties: PettyCashPropertyOption[];
  units: PettyCashUnitOption[];
}) {
  const [entryKind, setEntryKind] = useState<string>(
    entry?.entryKind ?? "expense",
  );
  const [economicScope, setEconomicScope] = useState<string>(
    entry?.economicScope ?? "property_expense",
  );
  const [ownerBillStatus, setOwnerBillStatus] = useState<string>(
    entry?.ownerBillStatus ?? "not_billable",
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    entry?.propertyId ?? "",
  );
  const [selectedUnitId, setSelectedUnitId] = useState(entry?.unitId ?? "");
  const [status, setStatus] = useState<string>(entry?.status ?? "draft");
  const [selectedCounterparty, setSelectedCounterparty] = useState<string>(
    entry?.counterpartyPersonId ??
      (entry && !entry.counterpartyPersonId
        ? PERSON_SELECT_EXTERNAL_VALUE
        : ""),
  );
  const [state, action, pending] = useActionState(
    entry ? updatePettyCashEntryAction : createPettyCashEntryAction,
    entryInitialState,
  );
  const availableUnits = useMemo(
    () => units.filter((unit) => unit.propertyId === selectedPropertyId),
    [selectedPropertyId, units],
  );
  const orderedCounterparties = useMemo(
    () =>
      rankCounterpartyOptions(
        counterpartyOptions,
        entryKind,
        account?.custodianPersonId,
      ),
    [account?.custodianPersonId, counterpartyOptions, entryKind],
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(
        state.message ??
          (entry ? "Petty cash row updated." : "Petty cash row added."),
      );
      onClose();
    }
  }, [entry, onClose, onSuccess, state.message, state.status]);

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
      {entry ? <input name="entryId" type="hidden" value={entry.id} /> : null}
      <input
        name="counterpartyMode"
        type="hidden"
        value={
          selectedCounterparty === PERSON_SELECT_EXTERNAL_VALUE
            ? "external"
            : "linked"
        }
      />
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
              name="status"
              onValueChange={setStatus}
              options={[
                { label: "Draft", value: "draft" },
                { label: "Cleared", value: "cleared" },
              ]}
              value={status}
            />
          </Field>
          <Field label="Invoice date" error={state.fieldErrors?.invoiceDate?.[0]}>
            <DatePickerField
              defaultValue={entry?.invoiceDate ?? getBusinessDateValue()}
              name="invoiceDate"
              required
            />
          </Field>
          <Field label="Clear date" error={state.fieldErrors?.clearDate?.[0]}>
            <DatePickerField defaultValue={entry?.clearDate} name="clearDate" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
            <SelectControl
              ariaLabel="Property"
              name="propertyId"
              onValueChange={(value) => {
                setSelectedPropertyId(value);
                setSelectedUnitId("");
              }}
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
              onValueChange={setSelectedUnitId}
              options={[
                { label: "Property level", value: "" },
                ...availableUnits.map((unit) => ({
                  label: unit.label,
                  value: unit.id,
                })),
              ]}
              value={selectedUnitId}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Field label="Category" error={state.fieldErrors?.category?.[0]}>
            <Input
              name="category"
              placeholder={entryKind === "expense" ? "Repairs, cleaning" : "Advance PM"}
              required
              defaultValue={entry?.category}
            />
          </Field>
          <Field label="Amount" error={state.fieldErrors?.amount?.[0]}>
            <NumberInput
              defaultValue={
                entry ? String(entry.inAmount + entry.outAmount) : undefined
              }
              min="0.01"
              name="amount"
              placeholder="0.00"
              required
            />
          </Field>
        </div>

        <Field
          label={entryKind === "expense" ? "Paid to" : "Received from"}
          error={
            state.fieldErrors?.counterpartyPersonId?.[0] ??
            state.fieldErrors?.supplier?.[0]
          }
        >
          <PersonSelect
            allowExternal
            context={
              entryKind === "expense"
                ? "Petty cash recipient"
                : "Petty cash source"
            }
            externalDescription="Record a transaction-time name without linking a Person"
            externalLabel="External party"
            name="counterpartyPersonId"
            onValueChange={setSelectedCounterparty}
            options={orderedCounterparties}
            placeholder={
              entryKind === "expense"
                ? "Search vendors, Staff, and people"
                : "Search custodian, Staff, and people"
            }
            preservedOption={
              entry?.counterpartyPersonId
                ? {
                    archived: false,
                    description: "Historical linked counterparty",
                    id: entry.counterpartyPersonId,
                    label:
                      entry.counterpartyCurrentName ??
                      entry.supplier ??
                      "Linked person",
                    roles: [],
                  }
                : undefined
            }
            roles={["tenant", "owner", "vendor", "staff"]}
            value={selectedCounterparty}
          />
        </Field>
        {selectedCounterparty === PERSON_SELECT_EXTERNAL_VALUE ? (
          <Field label="External party name" error={state.fieldErrors?.supplier?.[0]}>
            <Input
              defaultValue={entry?.counterpartyPersonId ? undefined : entry?.supplier}
              name="supplier"
              placeholder="Name shown on this cash record"
              required
            />
          </Field>
        ) : (
          <input name="supplier" type="hidden" value="" />
        )}
        <Field label="Description" error={state.fieldErrors?.description?.[0]}>
          <Textarea
            defaultValue={entry?.description}
            name="description"
            placeholder="What was paid for, or why cash came in"
            required
          />
        </Field>
        <Field
          label="Receipt / invoice reference"
          error={state.fieldErrors?.receiptReference?.[0]}
        >
          <Input
            defaultValue={entry?.receiptReference}
            name="receiptReference"
            placeholder="Receipt number or file note"
          />
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
                  defaultValue={
                    entry ? String(entry.ownerReimbursableAmount) : undefined
                  }
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
                  defaultValue={
                    entry ? String(entry.ownerReimbursedAmount) : undefined
                  }
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
                  defaultValue={entry ? String(entry.companyLossAmount) : undefined}
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
          <Textarea
            defaultValue={entry?.remark}
            name="remark"
            placeholder="Clearing note or exception"
          />
        </Field>
        <FormMessage state={state} />
      </div>
      <DrawerFooter
        disabled={pending}
        onClose={onClose}
        submitLabel={
          pending
            ? entry
              ? "Saving..."
              : "Adding..."
            : entry
              ? "Save changes"
              : "Add cash row"
        }
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
        <ConsequencePanel
          rows={[
            { label: "Expense", value: entry.category },
            { label: "Property", value: entry.unitNumber ? `${entry.propertyCode} / Unit ${entry.unitNumber}` : `${entry.propertyCode} / Property` },
            { label: "Ledger amount", value: formatMoneyDisplay(entry.outAmount, entry.currency).primary },
            { label: "Result", value: "Ledger expense and linked timeline event" },
          ]}
          summary="Creates one ledger expense and its linked timeline event. Cash advances remain reconciliation movements."
          title="Posting consequence"
        />
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

function VoidPettyCashPanel({
  entry,
  onClose,
  onSuccess,
}: {
  entry: PettyCashEntry;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    voidPettyCashEntryAction,
    voidInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(
        state.message ??
          "Petty cash row voided. Its original amount remains visible.",
      );
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="entryId" type="hidden" value={entry.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <ConsequencePanel
          rows={[
            { label: "Row", value: entry.category },
            {
              label: "Original amount",
              value: formatMoneyDisplay(
                entry.outAmount || entry.inAmount,
                entry.currency,
              ).primary,
            },
            { label: "Register impact", value: "Zero after voiding" },
          ]}
          summary="Keeps the original cash row and amount visible, records who voided it and why, and removes it from effective balances. This cannot be used after ledger posting."
          title="Void consequence"
        />
        <Field label="Void reason" error={state.fieldErrors?.voidReason?.[0]}>
          <Textarea
            name="voidReason"
            placeholder="Explain the correction and why the original row must remain"
            required
          />
        </Field>
        <FormMessage state={state} />
      </div>
      <DrawerFooter
        disabled={pending}
        onClose={onClose}
        submitLabel={pending ? "Voiding..." : "Void cash row"}
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
        <ConsequencePanel
          rows={[
            { label: "Closing month", value: formatDate(period.periodStart) },
            { label: "Carried balance", value: summary.balance.primary },
          ]}
          summary="Closes the current register month and carries its cash balance into the next month."
          title="Reconciliation consequence"
        />
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

function rankCounterpartyOptions(
  options: PersonSelectOption[],
  entryKind: PettyCashEntry["entryKind"] | string,
  custodianPersonId?: string,
) {
  return options.toSorted((first, second) => {
    const firstRank = counterpartyRank(first, entryKind, custodianPersonId);
    const secondRank = counterpartyRank(second, entryKind, custodianPersonId);

    return (
      firstRank - secondRank ||
      first.label.localeCompare(second.label, undefined, {
        numeric: true,
        sensitivity: "base",
      }) ||
      first.id.localeCompare(second.id)
    );
  });
}

function counterpartyRank(
  option: PersonSelectOption,
  entryKind: PettyCashEntry["entryKind"] | string,
  custodianPersonId?: string,
) {
  if (entryKind !== "expense" && option.id === custodianPersonId) {
    return 0;
  }

  if (entryKind === "expense" && option.roles.includes("vendor")) {
    return 0;
  }

  if (option.roles.includes("staff")) {
    return 1;
  }

  return 2;
}

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

  if (drawer.mode === "edit") {
    return "Edit petty cash row";
  }

  if (drawer.mode === "void") {
    return "Void petty cash row";
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

  if (drawer.mode === "edit") {
    return "Correct operational details before this row is posted.";
  }

  if (drawer.mode === "void") {
    return "Keep the original row visible while removing its balance impact.";
  }

  if (drawer.mode === "rollover") {
    return "Close this period and carry its cash balance forward.";
  }

  return "Record the cash movement first; post expenses to the ledger after review.";
}
