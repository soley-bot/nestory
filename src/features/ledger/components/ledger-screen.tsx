"use client";

import {
  useActionState,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Lock, Upload } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DOCUMENT_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { Modal } from "@/components/ui/modal";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceSplitView } from "@/components/layout/workspace-split-view";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import { ActivityDetailPanel } from "@/features/activity/components/activity-detail-panel";
import { RecentChangesPopover } from "@/features/activity/components/recent-changes-popover";
import type { RecentChange } from "@/features/activity/activity.types";
import {
  attachLedgerReceiptAction,
  type LedgerActionState,
  setLedgerPeriodLockAction,
} from "@/features/ledger/actions";
import { LedgerFilters } from "@/features/ledger/components/ledger-filters";
import { LedgerInspector } from "@/features/ledger/components/ledger-inspector";
import { LedgerTable } from "@/features/ledger/components/ledger-table";
import type {
  LedgerEntry,
  LedgerPagination as LedgerPaginationMeta,
  LedgerPeriodLock,
  LedgerPropertyOption,
  LedgerUnitOption,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";

const receiptInitialState: LedgerActionState = {};
const periodLockInitialState: LedgerActionState = {};

type DrawerState =
  | { mode: "receipt"; entry: LedgerEntry }
  | { mode: "activity"; change: RecentChange };

type LedgerScreenProps = {
  canLockFinancialMonth?: boolean;
  canManageFinance?: boolean;
  canReadFinanceReports?: boolean;
  canUnlockFinancialMonth?: boolean;
  entries: LedgerEntry[];
  initialEntryId?: string;
  pagination: LedgerPaginationMeta;
  periodLocks: LedgerPeriodLock[];
  propertyOptions: LedgerPropertyOption[];
  recentChanges: RecentChange[];
  unitOptions: LedgerUnitOption[];
  viewQuery: LedgerViewQuery;
};

export function LedgerScreen({
  canManageFinance = true,
  canLockFinancialMonth = canManageFinance,
  canReadFinanceReports = false,
  canUnlockFinancialMonth = canManageFinance,
  entries,
  initialEntryId,
  pagination,
  periodLocks,
  propertyOptions,
  recentChanges,
  unitOptions,
  viewQuery,
}: LedgerScreenProps) {
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [periodControlsOpen, setPeriodControlsOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState(() =>
    getInitialRecordId(entries, initialEntryId),
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const focusedEntry = initialEntryId
    ? (entries.find((entry) => entry.id === initialEntryId) ?? null)
    : null;
  const focusedEntryId = focusedEntry?.id;
  const selectedEntry = getSelectedRecord({
    focusedRecordId: initialEntryId,
    records: entries,
    selectedRecordId: selectedEntryId,
  });
  const rawReviewContext = getLedgerReviewContext(viewQuery, {
    hasFocusedEntry: Boolean(focusedEntry),
    hasFocusedEntryIntent: Boolean(initialEntryId),
  });
  const reviewContext =
    rawReviewContext && !canManageFinance
      ? {
          ...rawReviewContext,
          nextStep: "Select an entry to inspect its operational record.",
        }
      : rawReviewContext;
  const reviewPropertyLabel = getSelectedPropertyLabel(
    propertyOptions,
    viewQuery.propertyId,
  );
  const openLedgerAction = (nextDrawer: DrawerState) => {
    setCompactInspectorOpen(false);
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };
  const previewEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setCompactInspectorOpen(true);
  };

  useEffect(() => {
    if (!focusedEntryId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedEntryId(focusedEntryId);
      setCompactInspectorOpen(true);
    });
  }, [focusedEntryId]);

  const hasFilters =
    viewQuery.archiveState !== "active" ||
    viewQuery.dateFrom !== "" ||
    viewQuery.dateTo !== "" ||
    viewQuery.direction !== "all" ||
    viewQuery.minAmount !== null ||
    viewQuery.period !== "all" ||
    viewQuery.propertyId !== "all" ||
    viewQuery.query.trim() !== "" ||
    viewQuery.sort !== "date_desc" ||
    viewQuery.unitId !== "all";
  const ledgerList = (
    <section className="flex min-w-0 flex-col bg-card">
      {entries.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href="/ledger"
                scroll={false}
              >
                Clear filters
              </Link>
            ) : undefined
          }
          body={
            hasFilters
              ? "The current filters return no financial ledger records."
              : "No financial transactions have been recorded yet."
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={
            hasFilters ? "No matching ledger entries" : "No ledger entries yet"
          }
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <LedgerTable
              entries={entries}
              onSelectEntry={previewEntry}
              selectedEntryId={
                compactInspectorOpen ? (selectedEntry?.id ?? "") : ""
              }
            />
          </div>
          <PaginationControls pagination={pagination} />
        </>
      )}
    </section>
  );
  const ledgerInspector = selectedEntry ? (
    <LedgerInspector
      canManageFinance={canManageFinance}
      entry={selectedEntry}
      onAttachReceipt={(entry) => openLedgerAction({ entry, mode: "receipt" })}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        <>
          <RecentChangesPopover
            changes={recentChanges}
            onSelectChange={(change) => {
              openLedgerAction({ change, mode: "activity" });
            }}
          />
          {canLockFinancialMonth ? (
            <>
              <Button
                onClick={() => {
                  setCompactInspectorOpen(false);
                  setStatusMessage(null);
                  setPeriodControlsOpen(true);
                }}
              >
                <Lock size={15} />
                Month lock
              </Button>
            </>
          ) : null}
        </>
      }
      breadcrumbItems={[{ href: "/finance", label: "Finance" }]}
      context={`${reviewPropertyLabel ?? "All properties"} · ${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref="/ledger"
      localNav={(
        <FinanceWorkspaceNavigation
          activeRoute="/ledger"
          canClosePeriods={canLockFinancialMonth}
          canCorrectFinance={canManageFinance}
          canReadFinanceReports={canReadFinanceReports}
        />
      )}
      title="Ledger"
    >
      <div className="flex min-w-0 flex-col">
        {statusMessage ? (
          <div className="px-4 pt-5 sm:px-6 lg:px-6">
            <p
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
              role="status"
            >
              {statusMessage}
            </p>
          </div>
        ) : null}

        <LedgerSummaryStrip
          entries={entries}
          filters={
            <LedgerFilters
              properties={propertyOptions}
              units={unitOptions}
              viewQuery={viewQuery}
            />
          }
        />

        {reviewContext ? (
          <LedgerReviewStrip
            context={reviewContext}
            count={pagination.totalCount}
            propertyLabel={reviewPropertyLabel}
          />
        ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {ledgerInspector && selectedEntry ? (
            <WorkspaceSplitView
              inspector={ledgerInspector}
              inspectorLabel={`${selectedEntry.category} ledger quick view`}
              inspectorOpen={compactInspectorOpen}
              list={ledgerList}
              onInspectorOpenChange={setCompactInspectorOpen}
            />
          ) : (
            <WorkspaceSplitView list={ledgerList} />
          )}
        </div>

        {drawerState &&
        (canManageFinance || drawerState.mode === "activity") ? (
          <SideDrawer
            description={getLedgerDrawerDescription(drawerState)}
            onClose={() => setDrawerState(null)}
            open
            title={getLedgerDrawerTitle(drawerState)}
          >
            {drawerState.mode === "receipt" ? (
              <ReceiptPanel
                entry={drawerState.entry}
                onClose={() => setDrawerState(null)}
                onSuccess={setStatusMessage}
              />
            ) : drawerState.mode === "activity" ? (
              <ActivityDetailPanel change={drawerState.change} />
            ) : null}
          </SideDrawer>
        ) : null}
        {canLockFinancialMonth ? (
          <Modal
            description="Lock or unlock a financial month for the organization."
            onClose={() => setPeriodControlsOpen(false)}
            open={periodControlsOpen}
            title="Month lock"
          >
            <PeriodLockPanel
              canUnlockFinancialMonth={canUnlockFinancialMonth}
              onClose={() => setPeriodControlsOpen(false)}
              onSuccess={setStatusMessage}
              periodLocks={periodLocks}
            />
          </Modal>
        ) : null}
      </div>
    </WorkspacePage>
  );
}

function getLedgerDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "receipt") {
    return "Attach receipt";
  }

  if (drawer.mode === "activity") {
    return "Change detail";
  }

  return "Attach receipt";
}

function getLedgerDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "receipt") {
    return "Attach a receipt or invoice to this ledger entry and its linked timeline event.";
  }

  if (drawer.mode === "activity") {
    return "Review the before and after values recorded in the activity log.";
  }

  return "Attach supporting evidence without changing the source-owned Ledger event.";
}

type LedgerReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
};

type FocusedLedgerState = {
  hasFocusedEntry: boolean;
  hasFocusedEntryIntent: boolean;
};

function LedgerReviewStrip({
  context,
  count,
  propertyLabel,
}: {
  context: LedgerReviewContext;
  count: number;
  propertyLabel?: string;
}) {
  return (
    <div className="border-b border-border bg-muted/35 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "entry" : "entries"} {context.countLabel}
          {propertyLabel ? ` in ${propertyLabel}` : ""}
        </p>
        <p className="text-muted-foreground">{context.nextStep}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {context.description}
      </p>
    </div>
  );
}

export function getLedgerReviewContext(
  viewQuery: LedgerViewQuery,
  focusedState: FocusedLedgerState,
): LedgerReviewContext | null {
  if (focusedState.hasFocusedEntry) {
    return {
      countLabel: "in this activity view",
      description:
        "Opened from recent activity with archived records included.",
      nextStep:
        "The focused entry is available for table and inspector review.",
    };
  }

  if (focusedState.hasFocusedEntryIntent) {
    return {
      countLabel: "in this activity view",
      description:
        "Opened from recent activity with archived records included, but this page did not include the focused entry.",
      nextStep: "Review visible matches or broaden the current filters.",
    };
  }

  if (viewQuery.period === "current_month") {
    return {
      countLabel: "in the current month",
      description: "Dashboard ledger net opens this month-to-date view.",
      nextStep:
        "Select an entry to inspect, edit, attach a receipt, or lock the month.",
    };
  }

  if (
    viewQuery.period === "last_30_days" &&
    viewQuery.direction === "expense"
  ) {
    const threshold = viewQuery.minAmount
      ? ` at ${formatLedgerAmountThreshold(viewQuery.minAmount)} or more`
      : "";

    return {
      countLabel: `from recent expenses${threshold}`,
      description: `Dashboard expense review shows expenses from the last 30 days${threshold}.`,
      nextStep:
        "Check the largest entries first, then attach receipts or correct records.",
    };
  }

  if (viewQuery.period === "last_30_days") {
    return {
      countLabel: "from the last 30 days",
      description:
        "Showing the rolling 30-day ledger window from Dashboard context.",
      nextStep:
        "Select an entry to inspect the record and related timeline context.",
    };
  }

  if (viewQuery.dateFrom || viewQuery.dateTo) {
    return {
      countLabel: "in the selected date range",
      description: `Showing ${formatLedgerDateRange(
        viewQuery.dateFrom,
        viewQuery.dateTo,
      )}.`,
      nextStep: "Select an entry to inspect or adjust the ledger record.",
    };
  }

  if (viewQuery.direction !== "all") {
    return {
      countLabel: `from ${viewQuery.direction} records`,
      description: `Showing ${viewQuery.direction} entries only.`,
      nextStep: "Clear filters to return to the full ledger.",
    };
  }

  return null;
}

function formatLedgerDateRange(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo) {
    return `${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
  }

  if (dateFrom) {
    return `entries from ${formatDate(dateFrom)}`;
  }

  return `entries through ${formatDate(dateTo)}`;
}

function LedgerSummaryStrip({
  entries,
  filters,
}: {
  entries: LedgerEntry[];
  filters: ReactNode;
}) {
  const income = entries
    .filter((entry) => entry.direction === "income")
    .reduce((total, entry) => total + entry.amount, 0);
  const expense = entries
    .filter((entry) => entry.direction === "expense")
    .reduce((total, entry) => total + entry.amount, 0);
  const net = income - expense;
  return (
    <section className="flex flex-col gap-2 border-b border-border/70 bg-background px-4 py-2 sm:px-6 lg:flex-row lg:items-start">
      <div className="flex min-h-8 shrink-0 items-center gap-3 rounded-md border border-border/70 bg-card px-3">
        <div className="flex items-baseline gap-2">
          <p className="text-xs text-muted-foreground">Visible net</p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              net < 0 ? "text-danger" : "text-success"
            }`}
          >
            {formatMoneyDisplay(net).primary}
          </p>
        </div>
      </div>
      <div
        aria-label="Ledger tools"
        className="ml-auto flex w-full min-w-0 justify-end lg:w-auto lg:max-w-[430px] lg:flex-1"
        role="toolbar"
      >
        {filters}
      </div>
    </section>
  );
}

function formatLedgerAmountThreshold(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function getSelectedPropertyLabel(
  properties: LedgerPropertyOption[],
  propertyId: string,
) {
  if (propertyId === "all") {
    return undefined;
  }

  return properties.find((property) => property.id === propertyId)?.label;
}

function ReceiptPanel({
  entry,
  onClose,
  onSuccess,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    attachLedgerReceiptAction,
    receiptInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Receipt attached.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="entryId" type="hidden" value={entry.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-muted px-3 py-3">
          <p className="text-sm font-medium">{entry.category}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.relatedTimelineEvent
              ? "This receipt will also appear on the linked timeline event."
              : "This receipt is attached to the ledger entry."}
          </p>
        </div>

        <label className="block text-sm font-medium">
          Receipt file
          <FileDropzoneField
            accept={DOCUMENT_FILE_ACCEPT}
            className="mt-2"
            description="PDF, JPG, PNG, or WebP up to 10 MB."
            name="receipt"
            required
          />
          {state.fieldErrors?.receipt?.[0] ? (
            <p className="mt-1 text-xs text-danger">
              {state.fieldErrors.receipt[0]}
            </p>
          ) : null}
        </label>

        <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
          Accepted files: PDF, JPG, PNG, and WebP up to 10 MB.
        </p>

        {state.message ? (
          <p
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="default"
          >
            <Upload size={15} />
            {pending ? "Uploading..." : "Attach receipt"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PeriodLockPanel({
  canUnlockFinancialMonth,
  onClose,
  onSuccess,
  periodLocks,
}: {
  canUnlockFinancialMonth: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  periodLocks: LedgerPeriodLock[];
}) {
  const [state, action, pending] = useActionState(
    setLedgerPeriodLockAction,
    periodLockInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Financial month lock updated.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-5 px-4 py-5 sm:px-5">
        <ConsequencePanel
          summary={
            canUnlockFinancialMonth
              ? "Locking pauses authorized financial mutations for the selected month. Unlocking allows authorized corrections."
              : "Locking pauses authorized financial mutations for the selected month. A reason is required, and only Super Admin can unlock it."
          }
          title="Month lock consequence"
        />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <label className="block text-sm font-medium">
            Month
            <MonthPickerField
              ariaLabel="Month"
              className="mt-2"
              name="periodStart"
              required
            />
            {state.fieldErrors?.periodStart?.[0] ? (
              <p className="mt-1 text-xs text-danger">
                {state.fieldErrors.periodStart[0]}
              </p>
            ) : null}
          </label>

          <label className="block text-sm font-medium">
            State
            <SelectControl
              ariaLabel="State"
              className="mt-2"
              defaultValue="locked"
              name="lockState"
              options={[
                { label: "Lock", value: "locked" },
                ...(canUnlockFinancialMonth
                  ? [{ label: "Unlock", value: "unlocked" }]
                  : []),
              ]}
            />
          </label>
        </div>

        <label className="block text-sm font-medium">
          Reason
          <Textarea
            className="mt-2"
            name="reason"
            placeholder="Month-end review, correction window, or audit note"
            required={!canUnlockFinancialMonth}
          />
          {state.fieldErrors?.reason?.[0] ? (
            <p className="mt-1 text-xs text-danger">
              {state.fieldErrors.reason[0]}
            </p>
          ) : null}
        </label>

        {state.message ? (
          <p
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        <details className="border-y border-border py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Locked months ({periodLocks.length})
          </summary>
          {periodLocks.length === 0 ? (
            <p className="pt-3 text-sm text-muted-foreground">
              No months are locked.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-border">
              {periodLocks.map((periodLock) => (
                <div className="px-3 py-3 text-sm" key={periodLock.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">
                      {formatDate(periodLock.periodStart)}
                    </p>
                    <Lock className="text-muted-foreground" size={14} />
                  </div>
                  {periodLock.reason ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {periodLock.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </details>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="default"
          >
            <Lock size={15} />
            {pending ? "Updating..." : "Update lock"}
          </Button>
        </div>
      </div>
    </form>
  );
}
