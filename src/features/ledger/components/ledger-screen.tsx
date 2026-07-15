"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Archive, Lock, Plus, RotateCcw, Upload } from "lucide-react";
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
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  useWideWorkspace,
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { removeActionSearchParam as getHrefWithoutActionParam } from "@/lib/url/href";
import { ActivityDetailPanel } from "@/features/activity/components/activity-detail-panel";
import { RecentChangesPopover } from "@/features/activity/components/recent-changes-popover";
import type { RecentChange } from "@/features/activity/activity.types";
import { Badge } from "@/components/ui/badge";
import {
  archiveLedgerEntryAction,
  attachLedgerReceiptAction,
  type LedgerActionState,
  restoreLedgerEntryAction,
  setLedgerPeriodLockAction,
} from "@/features/ledger/actions";
import { LedgerEntryForm } from "@/features/ledger/components/ledger-entry-form";
import { LedgerFilters } from "@/features/ledger/components/ledger-filters";
import { LedgerInspector } from "@/features/ledger/components/ledger-inspector";
import { LedgerTable } from "@/features/ledger/components/ledger-table";
import type {
  LedgerEntry,
  LedgerCloseSummary,
  LedgerPagination as LedgerPaginationMeta,
  LedgerPeriodLock,
  LedgerPropertyOption,
  LedgerUnitOption,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";

const archiveInitialState: LedgerActionState = {};
const receiptInitialState: LedgerActionState = {};
const restoreInitialState: LedgerActionState = {};
const periodLockInitialState: LedgerActionState = {};

type DrawerState =
  | {
      entry?: never;
      initialValues?: LedgerCreateInitialValues;
      mode: "add";
    }
  | { mode: "archive"; entry: LedgerEntry }
  | { mode: "edit"; entry: LedgerEntry }
  | { mode: "restore"; entry: LedgerEntry }
  | { mode: "receipt"; entry: LedgerEntry }
  | { mode: "period-lock"; entry?: never }
  | { mode: "activity"; change: RecentChange };

type LedgerScreenProps = {
  closeSummary: LedgerCloseSummary;
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
  closeSummary,
  entries,
  initialEntryId,
  pagination,
  periodLocks,
  propertyOptions,
  recentChanges,
  unitOptions,
  viewQuery,
}: LedgerScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createInitialValues = useMemo(
    () => getLedgerCreateInitialValues(viewQuery, propertyOptions, unitOptions),
    [propertyOptions, unitOptions, viewQuery],
  );
  const [drawerState, setDrawerState] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "add" }
      : null,
  );
  const [selectedEntryId, setSelectedEntryId] = useState(() =>
    getInitialRecordId(entries, initialEntryId),
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
  const isWideWorkspace = useWideWorkspace();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const focusedEntry = initialEntryId
    ? entries.find((entry) => entry.id === initialEntryId) ?? null
    : null;
  const focusedEntryId = focusedEntry?.id;
  const selectedEntry = getSelectedRecord({
    focusedRecordId: initialEntryId,
    records: entries,
    selectedRecordId: selectedEntryId,
  });
  const reviewContext = getLedgerReviewContext(viewQuery, {
    hasFocusedEntry: Boolean(focusedEntry),
    hasFocusedEntryIntent: Boolean(initialEntryId),
  });
  const reviewPropertyLabel = getSelectedPropertyLabel(
    propertyOptions,
    viewQuery.propertyId,
  );
  const openLedgerAction = (nextDrawer: DrawerState) => {
    if (!isWideWorkspace) {
      setCompactInspectorOpen(false);
    }
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

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawerState({ initialValues: createInitialValues, mode: "add" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [createInitialValues, pathname, router, searchParams]);

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
  const openCreate = () =>
    openLedgerAction({ initialValues: createInitialValues, mode: "add" });
  const ledgerList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {entries.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href="/ledger"
                scroll={false}
              >
                Clear filters
              </Link>
            ) : (
              <Button onClick={openCreate} variant="primary">
                <Plus size={15} />
                Add entry
              </Button>
            )
          }
          body={
            hasFilters
              ? "The current filters return no financial ledger records."
              : "Add the first official income or expense record."
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching ledger entries" : "No ledger entries yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <LedgerTable
              entries={entries}
              onSelectEntry={previewEntry}
              selectedEntryId={selectedEntry?.id ?? ""}
            />
          </div>
          <PaginationControls attached pagination={pagination} />
        </>
      )}
    </section>
  );
  const ledgerInspector = selectedEntry ? (
    <LedgerInspector
      entry={selectedEntry}
      onArchiveEntry={(entry) => openLedgerAction({ entry, mode: "archive" })}
      onAttachReceipt={(entry) => openLedgerAction({ entry, mode: "receipt" })}
      onEditEntry={(entry) => openLedgerAction({ entry, mode: "edit" })}
      onRestoreEntry={(entry) => openLedgerAction({ entry, mode: "restore" })}
    />
  ) : null;

  return (
    <WorkspacePage
      header={<PageHeader
        actions={
          <>
            <RecentChangesPopover
              changes={recentChanges}
              onSelectChange={(change) => {
                openLedgerAction({ change, mode: "activity" });
              }}
            />
            <Button
              onClick={() => openLedgerAction({ mode: "period-lock" })}
            >
              <Lock size={15} />
              Period lock
            </Button>
            <Button
              onClick={() =>
                openCreate()
              }
              variant="primary"
            >
              <Plus size={15} />
              Add entry
            </Button>
          </>
        }
        context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
        title="Financial Ledger"
      />}
      toolbar={
        <LedgerFilters
          properties={propertyOptions}
          units={unitOptions}
          viewQuery={viewQuery}
        />
      }
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-6">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <LedgerCloseStrip closeSummary={closeSummary} entries={entries} />

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
            inspectorLabel={`${selectedEntry.category} ledger inspector`}
            inspectorOpen={isWideWorkspace || compactInspectorOpen}
            list={ledgerList}
            onInspectorOpenChange={setCompactInspectorOpen}
          />
        ) : (
          <WorkspaceSplitView list={ledgerList} />
        )}
      </div>

      {drawerState ? (
        <SideDrawer
          description={getLedgerDrawerDescription(drawerState)}
          onClose={() => setDrawerState(null)}
          open
          title={getLedgerDrawerTitle(drawerState)}
        >
          {drawerState.mode === "archive" ? (
            <ArchivePanel
              entry={drawerState.entry}
              onClose={() => setDrawerState(null)}
              onEdit={() =>
                setDrawerState({ entry: drawerState.entry, mode: "edit" })
              }
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "restore" ? (
            <RestorePanel
              entry={drawerState.entry}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "receipt" ? (
            <ReceiptPanel
              entry={drawerState.entry}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawerState.mode === "period-lock" ? (
            <PeriodLockPanel
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              periodLocks={periodLocks}
            />
          ) : drawerState.mode === "activity" ? (
            <ActivityDetailPanel change={drawerState.change} />
          ) : (
            <LedgerEntryForm
              entry={drawerState.entry}
              initialValues={
                drawerState.mode === "add" ? drawerState.initialValues : undefined
              }
              key={`${drawerState.mode}-${drawerState.entry?.id ?? "new"}`}
              mode={drawerState.mode}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
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

function getLedgerDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "add") {
    return "Add ledger entry";
  }

  if (drawer.mode === "edit") {
    return "Edit ledger entry";
  }

  if (drawer.mode === "restore") {
    return "Restore ledger entry";
  }

  if (drawer.mode === "receipt") {
    return "Attach receipt";
  }

  if (drawer.mode === "period-lock") {
    return "Accounting period lock";
  }

  if (drawer.mode === "activity") {
    return "Change detail";
  }

  return "Archive ledger entry";
}

function getLedgerDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "add") {
    return "New entries create a linked timeline record automatically.";
  }

  if (drawer.mode === "edit") {
    return "Update the financial record and keep its linked timeline event in sync.";
  }

  if (drawer.mode === "restore") {
    return "Return this entry to active totals and restore the linked timeline event when present.";
  }

  if (drawer.mode === "receipt") {
    return "Attach a receipt or invoice to this ledger entry and its linked timeline event.";
  }

  if (drawer.mode === "period-lock") {
    return "Lock or unlock accounting months so historical financial records cannot be changed accidentally.";
  }

  if (drawer.mode === "activity") {
    return "Review the before and after values recorded in the activity log.";
  }

  return "Hide this entry from ledger totals and archive the linked timeline event when present.";
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
    <div className="border-b border-border bg-surface-muted/35 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "entry" : "entries"} {context.countLabel}
          {propertyLabel ? ` in ${propertyLabel}` : ""}
        </p>
        <p className="text-foreground-muted">{context.nextStep}</p>
      </div>
      <p className="mt-1 text-xs text-foreground-subtle">{context.description}</p>
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
      description: "Opened from recent activity with archived records included.",
      nextStep: "The focused entry is available for table and inspector review.",
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
      nextStep: "Select an entry to inspect, edit, attach a receipt, or lock the period.",
    };
  }

  if (viewQuery.period === "last_30_days" && viewQuery.direction === "expense") {
    const threshold = viewQuery.minAmount
      ? ` at ${formatLedgerAmountThreshold(viewQuery.minAmount)} or more`
      : "";

    return {
      countLabel: `from recent expenses${threshold}`,
      description: `Dashboard expense review shows expenses from the last 30 days${threshold}.`,
      nextStep: "Check the largest entries first, then attach receipts or correct records.",
    };
  }

  if (viewQuery.period === "last_30_days") {
    return {
      countLabel: "from the last 30 days",
      description: "Showing the rolling 30-day ledger window from Dashboard context.",
      nextStep: "Select an entry to inspect the record and related timeline context.",
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

function LedgerCloseStrip({
  closeSummary,
  entries,
}: {
  closeSummary: LedgerCloseSummary;
  entries: LedgerEntry[];
}) {
  const income = entries
    .filter((entry) => entry.direction === "income")
    .reduce((total, entry) => total + entry.amount, 0);
  const expense = entries
    .filter((entry) => entry.direction === "expense")
    .reduce((total, entry) => total + entry.amount, 0);
  const net = income - expense;
  const sourceSummary = summarizeLedgerSources(entries);

  return (
    <section className="overflow-x-auto border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div className="grid min-w-[980px] grid-cols-[260px_minmax(420px,1fr)_260px] items-stretch gap-3 xl:min-w-0 xl:grid-cols-[minmax(260px,1.15fr)_minmax(0,2.4fr)_minmax(260px,1fr)]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Month close
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{closeSummary.monthLabel}</p>
            <Badge tone={hasOpenCloseQueue(closeSummary) ? "warning" : "success"}>
              {hasOpenCloseQueue(closeSummary) ? "Open queues" : "Ready"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            Clear operational queues and repair any missing accounting journals
            before relying on owner or finance reports.
          </p>
        </div>
        <div className="grid grid-cols-4 overflow-hidden rounded-md border border-border bg-surface-muted/25">
          <CloseLink
            count={closeSummary.incomeReadyToPost}
            href={closeSummary.incomeReadyHref}
            label="Received income"
          />
          <CloseLink
            count={closeSummary.billsReadyToPost}
            href={closeSummary.billsReadyHref}
            label="Approved bills"
          />
          <CloseLink
            count={closeSummary.pettyCashReadyToPost}
            href={closeSummary.pettyCashReadyHref}
            label="Cleared petty cash"
          />
          <CloseLink
            count={closeSummary.accountingUnlinkedCount}
            href={closeSummary.accountingUnlinkedHref}
            label="Missing journals"
          />
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface-muted/25">
          <CloseMetric label="Visible income" value={formatMoneyDisplay(income).primary} />
          <CloseMetric
            label="Visible expense"
            value={formatMoneyDisplay(expense).primary}
          />
          <CloseMetric
            label="Visible net"
            tone={net < 0 ? "danger" : "success"}
            value={formatMoneyDisplay(net).primary}
          />
          <CloseMetric label="Sources" value={sourceSummary} />
        </div>
      </div>
    </section>
  );
}

function CloseLink({
  count,
  href,
  label,
}: {
  count: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      className="min-w-0 border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-muted sm:border-b-0 sm:border-r sm:last:border-r-0"
      href={href}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold">{count}</p>
      <p className="mt-0.5 text-xs text-muted">
        {Number(count) > 0 ? "Open queue" : "Clear"}
      </p>
    </Link>
  );
}

function CloseMetric({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "danger" | "neutral" | "success";
  value: string;
}) {
  const valueClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";

  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className={`mt-1 truncate text-[13px] font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function hasOpenCloseQueue(closeSummary: LedgerCloseSummary) {
  return (
    Number(closeSummary.incomeReadyToPost) +
      Number(closeSummary.billsReadyToPost) +
      Number(closeSummary.pettyCashReadyToPost) +
      Number(closeSummary.accountingUnlinkedCount) >
    0
  );
}

function summarizeLedgerSources(entries: LedgerEntry[]) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    counts.set(entry.sourceLabel, (counts.get(entry.sourceLabel) ?? 0) + 1);
  }

  const [topSource, topCount] =
    Array.from(counts.entries()).sort((first, second) => second[1] - first[1])[0] ??
    [];

  return topSource ? `${topSource} ${topCount} rows` : "No rows";
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

export function getLedgerCreateInitialValues(
  viewQuery: LedgerViewQuery,
  properties: LedgerPropertyOption[],
  units: LedgerUnitOption[],
): LedgerCreateInitialValues | undefined {
  const direction =
    viewQuery.direction === "all" ? undefined : viewQuery.direction;
  const requestedUnit =
    viewQuery.unitId === "all"
      ? undefined
      : units.find((unit) => unit.id === viewQuery.unitId);
  const propertyId =
    requestedUnit?.propertyId ??
    (viewQuery.propertyId !== "all" &&
    properties.some((property) => property.id === viewQuery.propertyId)
      ? viewQuery.propertyId
      : "");
  const unitId =
    requestedUnit && requestedUnit.propertyId === propertyId ? requestedUnit.id : "";

  if (!direction && !propertyId && !unitId) {
    return undefined;
  }

  return {
    ...(direction ? { direction } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(unitId ? { unitId } : {}),
  };
}

type LedgerCreateInitialValues = Partial<
  Pick<LedgerEntry, "direction" | "propertyId" | "unitId">
>;

function ArchivePanel({
  entry,
  onClose,
  onEdit,
  onSuccess,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onEdit: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    archiveLedgerEntryAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Ledger entry archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="entryId" type="hidden" value={entry.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <ConsequencePanel
          className="border-danger/30 bg-danger-soft"
          rows={[
            { label: "Entry", value: entry.category },
            { label: "Scope", value: entry.unitNumber ? `${entry.propertyCode} / Unit ${entry.unitNumber}` : `${entry.propertyCode} / Property` },
          ]}
          summary="Removes this entry from active totals and archives its linked timeline event when present."
          title="Archive consequence"
        />
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onEdit}>
            Edit instead
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="primary"
          >
            <Archive size={15} />
            {pending ? "Archiving..." : "Archive entry"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RestorePanel({
  entry,
  onClose,
  onSuccess,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    restoreLedgerEntryAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Ledger entry restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="entryId" type="hidden" value={entry.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <ConsequencePanel
          rows={[
            { label: "Entry", value: entry.category },
            { label: "Scope", value: entry.unitNumber ? `${entry.propertyCode} / Unit ${entry.unitNumber}` : `${entry.propertyCode} / Property` },
          ]}
          summary="Adds this entry back into ledger totals and restores its linked timeline event when present."
          title="Restore consequence"
        />
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
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
            variant="primary"
          >
            <RotateCcw size={15} />
            {pending ? "Restoring..." : "Restore entry"}
          </Button>
        </div>
      </div>
    </form>
  );
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
    <form
      action={action}
      className="flex h-full flex-col"
    >
      <input name="entryId" type="hidden" value={entry.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-medium">{entry.category}</p>
          <p className="mt-1 text-sm text-muted">
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

        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs leading-5 text-muted">
          Accepted files: PDF, JPG, PNG, and WebP up to 10 MB.
        </p>

        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
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
            variant="primary"
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
  onClose,
  onSuccess,
  periodLocks,
}: {
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
      onSuccess(state.message ?? "Accounting period updated.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-5 px-4 py-5 sm:px-5">
        <ConsequencePanel
          summary="Locking prevents changes to historical financial records in the selected month. Unlocking reopens that month for authorized changes."
          title="Period lock consequence"
        />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
          <label className="block text-sm font-medium">
            Accounting month
            <MonthPickerField
              ariaLabel="Accounting month"
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
                { label: "Unlock", value: "unlocked" },
              ]}
            />
          </label>
        </div>

        <label className="block text-sm font-medium">
          Reason
          <Textarea
            className="mt-2"
            name="reason"
            placeholder="Month-end close, correction window, or audit note"
          />
          {state.fieldErrors?.reason?.[0] ? (
            <p className="mt-1 text-xs text-danger">
              {state.fieldErrors.reason[0]}
            </p>
          ) : null}
        </label>

        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        <section className="rounded-md border border-border">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Locked periods</p>
          </div>
          {periodLocks.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">
              No accounting periods are locked.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {periodLocks.map((periodLock) => (
                <div className="px-3 py-3 text-sm" key={periodLock.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">
                      {formatDate(periodLock.periodStart)}
                    </p>
                    <Lock className="text-muted" size={14} />
                  </div>
                  {periodLock.reason ? (
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {periodLock.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
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
            variant="primary"
          >
            <Lock size={15} />
            {pending ? "Updating..." : "Update period"}
          </Button>
        </div>
      </div>
    </form>
  );
}
