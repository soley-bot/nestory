"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Lock, Plus, RotateCcw, Upload } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityDetailPanel } from "@/features/activity/components/activity-detail-panel";
import { RecentChangesPopover } from "@/features/activity/components/recent-changes-popover";
import type { RecentChange } from "@/features/activity/activity.types";
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
  LedgerPagination as LedgerPaginationMeta,
  LedgerPeriodLock,
  LedgerPropertyOption,
  LedgerUnitOption,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";

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
  const [previewOpen, setPreviewOpen] = useState(false);
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
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawerState(nextDrawer);
  };
  const previewEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!focusedEntryId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedEntryId(focusedEntryId);
      setPreviewOpen(true);
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

  return (
    <div className="min-h-screen">
      <PageHeader
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
                openLedgerAction({
                  initialValues: createInitialValues,
                  mode: "add",
                })
              }
              variant="primary"
            >
              <Plus size={15} />
              Add entry
            </Button>
          </>
        }
        description="Record income and expenses against properties and units while keeping the timeline in sync."
        title="Financial Ledger"
      />

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

      <LedgerFilters
        properties={propertyOptions}
        units={unitOptions}
        viewQuery={viewQuery}
      />

      {reviewContext ? (
        <LedgerReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
          propertyLabel={reviewPropertyLabel}
        />
      ) : null}

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="min-w-0 space-y-0">
          <LedgerTable
            entries={entries}
            onSelectEntry={previewEntry}
            selectedEntryId={selectedEntry?.id ?? ""}
          />
          <PaginationControls attached pagination={pagination} />
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedEntry)}
        title="Ledger preview"
      >
        <LedgerInspector
          entry={selectedEntry}
          onArchiveEntry={(entry) => openLedgerAction({ entry, mode: "archive" })}
          onAttachReceipt={(entry) => openLedgerAction({ entry, mode: "receipt" })}
          onEditEntry={(entry) => openLedgerAction({ entry, mode: "edit" })}
          onRestoreEntry={(entry) => openLedgerAction({ entry, mode: "restore" })}
        />
      </RecordPreviewDrawer>

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

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");

  const queryString = nextParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
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
        <div className="flex items-center gap-2 text-danger">
          <Archive size={16} />
          <p className="text-sm font-semibold">Archive confirmation</p>
        </div>
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-medium">{entry.category}</p>
          <p className="mt-1 text-sm text-muted">
            {entry.propertyCode}
            {entry.unitNumber ? ` / Unit ${entry.unitNumber}` : " / Property"}
          </p>
        </div>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          This removes the entry from active totals. Any linked timeline event is
          archived with it, so history stays consistent.
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
        <div className="flex items-center gap-2 text-accent">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-medium">{entry.category}</p>
          <p className="mt-1 text-sm text-muted">
            {entry.propertyCode}
            {entry.unitNumber ? ` / Unit ${entry.unitNumber}` : " / Property"}
          </p>
        </div>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Restoring adds this entry back into ledger totals. If a linked timeline
          event exists, it is restored at the same time.
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
