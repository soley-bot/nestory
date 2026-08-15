"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  Eye,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  ShieldX,
  Wallet,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceSplitView } from "@/components/layout/workspace-split-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
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
  pettyCashEconomicScopeOptions,
  pettyCashOwnerBillStatusOptions,
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
  | {
      account: PettyCashAccount;
      mode: "rollover";
      period: PettyCashPeriod;
      summary: PettyCashSummary;
    }
  | { entry: PettyCashEntry; mode: "post" };

type PettyCashScreenProps = {
  accounts: PettyCashAccount[];
  canManageFinance?: boolean;
  canManagePettyCash?: boolean;
  canReadFinanceReports?: boolean;
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
  canManageFinance = true,
  canManagePettyCash = canManageFinance,
  canReadFinanceReports = false,
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
      ? (entries.find((entry) => entry.id === focusedEntryId) ?? null)
      : null;
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState(
    focusedEntry?.id ?? (hasFocusedEntry ? "" : entries[0]?.id) ?? "",
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(
    Boolean(focusedEntry),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const returnFocusTargetRef = useRef<
    | { action: "account" | "add-entry"; kind: "action" }
    | { entryId: string; kind: "preview" }
    | null
  >(null);
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ??
    (hasFocusedEntry ? null : entries[0]) ??
    null;
  const canAddEntry =
    canManagePettyCash &&
    selectedAccount?.status === "active" &&
    period?.status === "open";
  const canRenderOverlay =
    drawerState &&
    (canManageFinance ||
      (canManagePettyCash &&
        (drawerState.mode === "entry" || drawerState.mode === "post")));
  const usesCompactModal =
    drawerState &&
    drawerState.mode !== "entry" &&
    drawerState.mode !== "edit";

  const openDrawer = (nextDrawer: DrawerState) => {
    returnFocusTargetRef.current = compactInspectorOpen
      ? { entryId: selectedEntryId, kind: "preview" }
      : nextDrawer.mode === "account" || nextDrawer.mode === "rollover"
        ? { action: "account", kind: "action" }
        : nextDrawer.mode === "entry"
          ? { action: "add-entry", kind: "action" }
          : null;
    setCompactInspectorOpen(false);
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };

  const closeOverlay = () => {
    const returnTarget = returnFocusTargetRef.current;
    returnFocusTargetRef.current = null;
    setDrawerState(null);
    requestAnimationFrame(() => {
      const target =
        returnTarget?.kind === "preview"
          ? Array.from(
              document.querySelectorAll<HTMLButtonElement>(
                "[data-petty-cash-preview-id]",
              ),
            ).find(
              (button) =>
                button.dataset.pettyCashPreviewId === returnTarget.entryId,
            )
          : returnTarget?.kind === "action"
            ? document.querySelector<HTMLButtonElement>(
                `[data-petty-cash-action="${returnTarget.action}"]`,
              )
            : null;
      target?.focus();
    });
  };

  const previewEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setCompactInspectorOpen(true);
  };

  const overlayContent = drawerState ? (
    drawerState.mode === "account" ? (
      <PettyCashAccountForm
        onClose={closeOverlay}
        onSuccess={setStatusMessage}
        staffOptions={staffOptions}
      />
    ) : drawerState.mode === "post" ? (
      <PostPettyCashPanel
        entry={drawerState.entry}
        onClose={closeOverlay}
        onSuccess={setStatusMessage}
      />
    ) : drawerState.mode === "void" ? (
      <VoidPettyCashPanel
        entry={drawerState.entry}
        onClose={closeOverlay}
        onSuccess={setStatusMessage}
      />
    ) : drawerState.mode === "rollover" ? (
      <OpenNextPeriodPanel
        account={drawerState.account}
        onClose={closeOverlay}
        onSuccess={setStatusMessage}
        period={drawerState.period}
        summary={drawerState.summary}
      />
    ) : (
      <PettyCashEntryForm
        account={selectedAccount}
        counterpartyOptions={counterpartyOptions}
        entry={drawerState.mode === "edit" ? drawerState.entry : undefined}
        onClose={closeOverlay}
        onSuccess={setStatusMessage}
        period={period}
        properties={propertyOptions}
        units={unitOptions}
      />
    )
  ) : null;

  const registerList =
    selectedAccount && period ? (
      <section className="flex min-w-0 flex-col bg-card">
        {entries.length === 0 ? (
          <EmptyState
            action={
              canAddEntry ? (
                <Button
                  data-petty-cash-action="add-entry"
                  onClick={() => openDrawer({ mode: "entry" })}
                  variant="default"
                >
                  <Plus size={15} />
                  Add cash row
                </Button>
              ) : undefined
            }
            body={
              canAddEntry
                ? "Record the first advance, cash-in movement, or expense."
                : "No petty cash movements are available for this period."
            }
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
                selectedEntryId={
                  compactInspectorOpen ? (selectedEntry?.id ?? "") : ""
                }
              />
            </div>
          </>
        )}
      </section>
    ) : null;
  const cashInspector =
    selectedAccount && selectedEntry && period ? (
      <PettyCashInspector
        account={selectedAccount}
        canManageFinance={canManageFinance}
        canManagePettyCash={canManagePettyCash}
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
        !schemaStatus.isReady || (!canManageFinance && !canManagePettyCash) ? undefined : (
          <div className="flex flex-wrap gap-2">
            {canManageFinance ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-petty-cash-action="account" variant="outline">
                    <MoreHorizontal size={15} />
                    Account actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => openDrawer({ mode: "account" })}>
                    <Wallet size={15} />
                    Add account
                  </DropdownMenuItem>
                  {selectedAccount?.status === "active" && period ? (
                    <DropdownMenuItem
                      onSelect={() =>
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
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {selectedAccount?.status === "active" && period ? (
              canAddEntry ? (
                <Button
                  data-petty-cash-action="add-entry"
                  onClick={() => openDrawer({ mode: "entry" })}
                  variant="default"
                >
                  <Plus size={15} />
                  Add cash row
                </Button>
              ) : null
            ) : null}
          </div>
        )
      }
      context={
        selectedAccount
          ? `${selectedAccount.accountNumber} / ${selectedAccount.name}`
          : "Cash register"
      }
      contextHref="/petty-cash"
      localNav={(
        <FinanceWorkspaceNavigation
          activeRoute="/petty-cash"
          canReadFinanceReports={canReadFinanceReports}
        />
      )}
      title="Petty cash"
    >
      <div className="flex min-w-0 flex-col bg-background">
        {statusMessage ? (
          <div className="border-b border-border bg-muted/35 px-4 py-2 sm:px-6">
            <p className="text-sm" role="status">
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
                schemaStatus.isReady && canManageFinance ? (
                  <Button
                    onClick={() => openDrawer({ mode: "account" })}
                    variant="default"
                  >
                    <Plus size={15} />
                    Add account
                  </Button>
                ) : undefined
              }
              body={
                schemaStatus.isReady
                  ? canManageFinance
                    ? "Add the first petty cash account and opening float."
                    : "No petty cash account is configured for this workspace."
                  : (schemaStatus.message ??
                    "Petty cash is not configured for this workspace.")
              }
              className="h-full"
              kind={schemaStatus.isReady ? "empty" : "permission"}
              title={
                schemaStatus.isReady
                  ? "No petty cash account yet"
                  : "Petty cash unavailable"
              }
            />
          )}
        </div>

        {canRenderOverlay && drawerState && usesCompactModal ? (
          <Modal
            description={getDrawerDescription(drawerState)}
            onClose={closeOverlay}
            open
            size={drawerState.mode === "account" ? "default" : "compact"}
            title={getDrawerTitle(drawerState)}
          >
            {overlayContent}
          </Modal>
        ) : canRenderOverlay && drawerState ? (
          <SideDrawer
            description={getDrawerDescription(drawerState)}
            onClose={closeOverlay}
            open
            title={getDrawerTitle(drawerState)}
          >
            {overlayContent}
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
    <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/45 px-4 py-2 sm:px-6">
      <div>
        <p className="text-sm font-medium">
          {isAvailable
            ? "Focused from activity history"
            : "Source record unavailable"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAvailable
            ? isArchived
              ? "Archived source record"
              : "The exact Petty Cash row is open for review."
            : "The record does not exist or you no longer have access."}
        </p>
      </div>
      <Link
        aria-label="Clear focused record"
        className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted"
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
  if (!account || accounts.length === 0) {
    return (
      <section
        aria-label="Petty cash summary"
        className="border-b border-border/70 bg-background px-4 py-2 sm:px-6"
      >
        <div className="inline-flex min-h-8 items-center rounded-md border border-border/70 bg-card px-3 text-sm">
          <span className="font-medium">No account configured</span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Petty cash summary"
      className="border-b border-border/70 bg-background px-4 py-2 sm:px-6"
    >
      <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-2">
        <div className="w-[260px] min-w-0">
          <SearchableSelectControl
            ariaLabel="Petty cash account"
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
        </div>
        <SummaryValue label="On hand" value={summary.balance.primary} />
        {period ? (
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
            <span>{formatDate(period.periodStart)}</span>
            <Badge tone={period.status === "open" ? "success" : "neutral"}>
              {period.status === "open" ? "Open" : "Closed"}
            </Badge>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] border-l border-border/70 pl-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
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
    <div className="overflow-hidden" data-petty-cash-surface="register">
      <div aria-label="Petty cash table" className="overflow-x-auto" role="region">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[104px]" />
            <col />
            <col className="w-[140px]" />
            <col className="w-[118px]" />
            <col className="w-[118px]" />
            <col className="w-[132px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs uppercase tracking-[0] text-muted-foreground shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Entry</th>
              <th className="px-3 py-2.5 font-semibold">Property / Unit</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
              <th className="px-3 py-2.5 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-muted-foreground"
                  colSpan={6}
                >
                  No petty cash rows yet.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  selectedEntryId === entry.id &&
                    "bg-muted shadow-[inset_3px_0_0_var(--accent)]",
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
                  <p className="text-muted-foreground">
                    {formatDate(entry.invoiceDate)}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <p className="truncate font-medium">
                    {entry.supplier ?? entry.category}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {entry.category} · {entry.description}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {entry.propertyId ? (
                    <Link
                      className="block truncate font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                      href={`/properties/${entry.propertyId}/account`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {entry.propertyCode}
                    </Link>
                  ) : (
                    <p className="truncate font-medium">Cash account</p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {entry.unitNumber
                      ? `Unit ${entry.unitNumber}`
                      : "Property level"}
                  </p>
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  data-money-cell="true"
                >
                  <span
                    className={
                      entry.status === "void"
                        ? "line-through text-muted-foreground"
                        : ""
                    }
                  >
                    {
                      formatMoneyDisplay(
                        entry.outAmount > 0 ? -entry.outAmount : entry.inAmount,
                        entry.currency,
                      ).primary
                    }
                  </span>
                  {entry.status === "void" ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      No impact
                    </span>
                  ) : null}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  data-money-cell="true"
                >
                  {
                    formatMoneyDisplay(entry.balanceAfter, entry.currency)
                      .primary
                  }
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <StatusBadge status={entry.status} />
                  <Button
                    aria-label={`Preview ${entry.category}`}
                    aria-pressed={selectedEntryId === entry.id}
                    className="h-8 w-8 px-0"
                    data-petty-cash-preview-id={entry.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEntry(entry.id);
                    }}
                    title={`Preview ${entry.category}`}
                    variant="ghost"
                  >
                    <Eye size={15} />
                  </Button>
                  </div>
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
  canManageFinance,
  canManagePettyCash,
  entry,
  onEdit,
  onPost,
  onVoid,
  period,
}: {
  account: PettyCashAccount;
  canManageFinance: boolean;
  canManagePettyCash: boolean;
  entry: PettyCashEntry | null;
  onEdit: (entry: PettyCashEntry) => void;
  onPost: (entry: PettyCashEntry) => void;
  onVoid: (entry: PettyCashEntry) => void;
  period: PettyCashPeriod;
}) {
  if (!entry) {
    return (
      <aside className="p-4" data-slot="cash-quick-view-body">
        <h2 className="text-sm font-semibold">Petty cash row</h2>
      </aside>
    );
  }

  const canPost =
    canManagePettyCash &&
    !entry.archivedAt &&
    account.status === "active" &&
    entry.entryKind === "expense" &&
    entry.status !== "posted" &&
    entry.status !== "void" &&
    period.status !== "closed";
  const canCorrect =
    canManageFinance &&
    !entry.archivedAt &&
    account.status === "active" &&
    (entry.status === "draft" || entry.status === "cleared") &&
    !entry.ledgerEntryId &&
    period.status !== "closed";

  return (
    <aside className="min-h-0 overflow-hidden" data-slot="cash-quick-view-body">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {entry.entryKind === "expense" ? "Cash expense" : "Cash movement"}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold">
              {entry.category}
            </h2>
          </div>
          <StatusBadge status={entry.status} />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {entry.description}
        </p>
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

      <div className="space-y-4 p-4 text-sm">
        <dl className="divide-y divide-border border-y border-border">
          <InspectorFact
            label="Counterparty"
            value={
              entry.supplier ?? entry.counterpartyCurrentName ?? "Not recorded"
            }
          />
          <InspectorFact
            label="Property / unit"
            value={
              entry.propertyId ? (
                <Link
                  className="text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                  href={`/properties/${entry.propertyId}/account`}
                >
                  {entry.propertyCode}
                  {entry.unitId ? ` / Unit ${entry.unitNumber}` : ""}
                </Link>
              ) : (
                "Cash account"
              )
            }
          />
          <InspectorFact label="Period" value={formatDate(period.periodStart)} />
        </dl>

        {entry.voidReason ? (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5">
            <p className="font-semibold text-danger">Voided</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {entry.voidReason}
            </p>
            {entry.voidedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(entry.voidedAt)}
              </p>
            ) : null}
          </div>
        ) : null}

        {entry.entryKind === "expense" ? (
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-semibold">Receipt</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {entry.receiptReference ?? "Missing reference"}
              </p>
            </div>
            <Badge tone={entry.receiptReference ? "success" : "warning"}>
              {entry.receiptReference ? "Ready" : "Review"}
            </Badge>
          </div>
        ) : (
          <p className="border-b border-border pb-3 text-xs leading-5 text-muted-foreground">
            Cash-in movement for reconciliation; it does not post as income.
          </p>
        )}

        {entry.entryKind === "expense" &&
        entry.economicScope !== "property_expense" ? (
          <div className="border-b border-border pb-3">
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
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {entry.economicScope === "company_advance"
                ? `${entry.ownerReceivable.primary} still receivable from owner.`
                : entry.economicScope === "company_cost"
                  ? "This cash spend reduces company P&L."
                  : null}
            </p>
          </div>
        ) : null}

        {entry.ledgerEntryId ? (
          <Link
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted"
            href={`/ledger?archiveState=all&entryId=${entry.ledgerEntryId}`}
          >
            <ExternalLink size={14} />
            Open ledger entry
          </Link>
        ) : canCorrect || canPost ? (
          <div className="grid gap-2">
            {canPost ? (
              <Button
                className="w-full"
                onClick={() => onPost(entry)}
                variant="default"
              >
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
          <div className="rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground">
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
    <form action={action}>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Account number" error={state.fieldErrors?.accountNumber?.[0]}>
          <Input name="accountNumber" placeholder="PM-CASH-01" required />
        </Field>
        <Field label="Account name" error={state.fieldErrors?.name?.[0]}>
          <Input name="name" placeholder="Office petty cash" required />
        </Field>
        <Field
          label="Float / advance amount"
          error={state.fieldErrors?.floatAmount?.[0]}
        >
          <NumberInput
            min="0"
            name="floatAmount"
            placeholder="0.00"
            step="0.01"
          />
        </Field>
        <Field
          label="Custodian (optional)"
          error={state.fieldErrors?.custodianPersonId?.[0]}
        >
          <PersonSelect
            allowClear
            context="Petty cash custodian"
            name="custodianPersonId"
            options={staffOptions}
            placeholder="Search active Staff"
            roles={["staff"]}
          />
        </Field>
        <div className="sm:col-span-2">
          <FormMessage state={state} />
        </div>
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
  const [idempotencyKey] = useState(() =>
    entry ? "" : `petty-entry-${globalThis.crypto.randomUUID()}`,
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
      <div className="p-5 text-sm text-muted-foreground">
        Create a petty cash account before adding rows.
      </div>
    );
  }

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="accountId" type="hidden" value={account.id} />
      <input name="periodId" type="hidden" value={period.id} />
      {entry ? <input name="entryId" type="hidden" value={entry.id} /> : null}
      {entry ? null : (
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      )}
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
          <Field
            label="Invoice date"
            error={state.fieldErrors?.invoiceDate?.[0]}
          >
            <DatePickerField
              defaultValue={entry?.invoiceDate ?? getBusinessDateValue()}
              name="invoiceDate"
              required
            />
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
              placeholder={
                entryKind === "expense" ? "Repairs, cleaning" : "Advance PM"
              }
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
          <Field
            label="External party name"
            error={state.fieldErrors?.supplier?.[0]}
          >
            <Input
              defaultValue={
                entry?.counterpartyPersonId ? undefined : entry?.supplier
              }
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
        <details
          className="group rounded-md border border-border"
          open={Boolean(entry)}
        >
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
            Receipt and reconciliation
          </summary>
          <div className="space-y-4 border-t border-border p-3">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field
                label="Clear date"
                error={state.fieldErrors?.clearDate?.[0]}
              >
                <DatePickerField
                  defaultValue={entry?.clearDate}
                  name="clearDate"
                />
              </Field>
            </div>
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
              <div className="space-y-3 border-t border-border pt-3">
                <Field
                  label="Cost handling"
                  error={state.fieldErrors?.economicScope?.[0]}
                >
                  <SelectControl
                    ariaLabel="Company handling"
                    name="economicScope"
                    onValueChange={(value) => {
                      setEconomicScope(value);
                      setOwnerBillStatus(
                        value === "company_advance"
                          ? "billable"
                          : "not_billable",
                      );
                    }}
                    options={[...pettyCashEconomicScopeOptions]}
                    value={economicScope}
                  />
                </Field>
                {economicScope === "company_advance" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Owner bill status"
                      error={state.fieldErrors?.ownerBillStatus?.[0]}
                    >
                      <SelectControl
                        ariaLabel="Owner bill status"
                        name="ownerBillStatus"
                        onValueChange={setOwnerBillStatus}
                        options={[...pettyCashOwnerBillStatusOptions]}
                        value={ownerBillStatus}
                      />
                    </Field>
                    <Field
                      label="Billable to owner"
                      error={state.fieldErrors?.ownerReimbursableAmount?.[0]}
                    >
                      <NumberInput
                        defaultValue={
                          entry
                            ? String(entry.ownerReimbursableAmount)
                            : undefined
                        }
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
                          entry
                            ? String(entry.ownerReimbursedAmount)
                            : undefined
                        }
                        min="0"
                        name="ownerReimbursedAmount"
                        placeholder="0.00"
                        step="0.01"
                      />
                    </Field>
                  </div>
                ) : economicScope === "company_cost" ? (
                  <Field
                    label="Company loss"
                    error={state.fieldErrors?.companyLossAmount?.[0]}
                  >
                    <NumberInput
                      defaultValue={
                        entry ? String(entry.companyLossAmount) : undefined
                      }
                      min="0"
                      name="companyLossAmount"
                      placeholder="Defaults to amount"
                      step="0.01"
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
            <Field label="Remark" error={state.fieldErrors?.remark?.[0]}>
              <Textarea
                defaultValue={entry?.remark}
                name="remark"
                placeholder="Clearing note or exception"
              />
            </Field>
          </div>
        </details>
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
        <OperationSummary
          ariaLabel="Posting consequence"
          rows={[
            { label: "Expense", value: entry.category },
            {
              label: "Property",
              value: entry.unitNumber
                ? `${entry.propertyCode} / Unit ${entry.unitNumber}`
                : `${entry.propertyCode} / Property`,
            },
            {
              label: "Ledger amount",
              value: formatMoneyDisplay(entry.outAmount, entry.currency)
                .primary,
            },
          ]}
          note="Creates one ledger expense and a linked timeline event."
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
        <OperationSummary
          ariaLabel="Void consequence"
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
          note="Keeps the original row visible and removes it from effective balances."
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
        <OperationSummary
          ariaLabel="Reconciliation consequence"
          rows={[
            { label: "Closing month", value: formatDate(period.periodStart) },
            { label: "Carried balance", value: summary.balance.primary },
          ]}
          note="Closes this month and carries its balance into the next month."
        />
        <Field
          label="Next advance amount"
          error={state.fieldErrors?.advanceAmount?.[0]}
        >
          <NumberInput
            min="0"
            name="advanceAmount"
            placeholder="Auto top up to target float"
            step="0.01"
          />
        </Field>
        <p className="text-xs leading-5 text-muted-foreground">
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

function InspectorFact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

function OperationSummary({
  ariaLabel,
  note,
  rows,
}: {
  ariaLabel: string;
  note: string;
  rows: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <section aria-label={ariaLabel} role="region">
      <dl className="divide-y divide-border border-y border-border">
        {rows.map((row) => (
          <div
            className="flex items-start justify-between gap-3 py-2.5 text-sm"
            key={row.label}
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p>
    </section>
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
      className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
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
        <Button
          className="w-full sm:w-auto"
          onClick={onClose}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={disabled}
          type="submit"
          variant="default"
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
    return "Set up a cash register and opening float.";
  }

  if (drawer.mode === "post") {
    return "Post this cash expense to the ledger.";
  }

  if (drawer.mode === "edit") {
    return "Update this unposted cash row.";
  }

  if (drawer.mode === "void") {
    return "Reverse this row and preserve its audit trail.";
  }

  if (drawer.mode === "rollover") {
    return "Carry this closing balance into the next month.";
  }

  return "Record a cash movement.";
}
