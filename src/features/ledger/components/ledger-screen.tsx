"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Lock, Plus, RotateCcw, Upload } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { Button } from "@/components/ui/button";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
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
import type { CurrencyDisplaySettings } from "@/lib/money/format";

const archiveInitialState: LedgerActionState = {};
const receiptInitialState: LedgerActionState = {};
const restoreInitialState: LedgerActionState = {};
const periodLockInitialState: LedgerActionState = {};

type DrawerState =
  | { mode: "add"; entry?: never }
  | { mode: "archive"; entry: LedgerEntry }
  | { mode: "edit"; entry: LedgerEntry }
  | { mode: "restore"; entry: LedgerEntry }
  | { mode: "receipt"; entry: LedgerEntry }
  | { mode: "period-lock"; entry?: never }
  | { mode: "activity"; change: RecentChange };

type LedgerScreenProps = {
  currencySettings: CurrencyDisplaySettings;
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
  currencySettings,
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
  const [drawerState, setDrawerState] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create" ? { mode: "add" } : null,
  );
  const [selectedEntryId, setSelectedEntryId] = useState(
    initialEntryId ?? entries[0]?.id ?? "",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            <RecentChangesPopover
              changes={recentChanges}
              onSelectChange={(change) => {
                setStatusMessage(null);
                setDrawerState({ change, mode: "activity" });
              }}
            />
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawerState({ mode: "period-lock" });
              }}
            >
              <Lock size={15} />
              Period lock
            </Button>
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawerState({ mode: "add" });
              }}
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

      <LedgerFilters properties={propertyOptions} viewQuery={viewQuery} />

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <LedgerTable
              currencySettings={currencySettings}
              entries={entries}
              onArchiveEntry={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "archive" });
              }}
              onEditEntry={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "edit" });
              }}
              onRestoreEntry={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "restore" });
              }}
              onSelectEntry={setSelectedEntryId}
              selectedEntryId={selectedEntry?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <div className="hidden 2xl:block">
            <LedgerInspector
              currencySettings={currencySettings}
              entry={selectedEntry}
              onArchiveEntry={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "archive" });
              }}
              onAttachReceipt={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "receipt" });
              }}
              onEditEntry={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "edit" });
              }}
              onRestoreEntry={(entry) => {
                setStatusMessage(null);
                setDrawerState({ entry, mode: "restore" });
              }}
            />
          </div>
        </div>
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
              key={`${drawerState.mode}-${drawerState.entry?.id ?? "new"}`}
              mode={drawerState.mode}
              onClose={() => setDrawerState(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              defaultCurrency={currencySettings.preferredCurrency}
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
      encType="multipart/form-data"
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
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-accent focus:ring-2 focus:ring-accent-soft"
            name="receipt"
            required
            type="file"
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
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
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
