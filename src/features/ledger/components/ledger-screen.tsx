"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Archive, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { PageHeader } from "@/components/layout/page-header";
import { RecentChangesPanel } from "@/features/activity/components/recent-changes-panel";
import type { RecentChange } from "@/features/activity/activity.types";
import {
  archiveLedgerEntryAction,
  type LedgerActionState,
} from "@/features/ledger/actions";
import { LedgerEntryForm } from "@/features/ledger/components/ledger-entry-form";
import { LedgerFilters } from "@/features/ledger/components/ledger-filters";
import { LedgerInspector } from "@/features/ledger/components/ledger-inspector";
import { LedgerSummary } from "@/features/ledger/components/ledger-summary";
import { LedgerTable } from "@/features/ledger/components/ledger-table";
import { filterLedgerEntries } from "@/features/ledger/ledger.filters";
import type {
  LedgerEntry,
  LedgerPropertyOption,
  LedgerSnapshot,
  LedgerUnitOption,
} from "@/features/ledger/ledger.types";

const archiveInitialState: LedgerActionState = {};

type DrawerState =
  | { mode: "add"; entry?: never }
  | { mode: "archive"; entry: LedgerEntry }
  | { mode: "edit"; entry: LedgerEntry };

type LedgerScreenProps = {
  entries: LedgerEntry[];
  initialEntryId?: string;
  propertyOptions: LedgerPropertyOption[];
  recentChanges: RecentChange[];
  snapshot: LedgerSnapshot;
  unitOptions: LedgerUnitOption[];
};

export function LedgerScreen({
  entries,
  initialEntryId,
  propertyOptions,
  recentChanges,
  snapshot,
  unitOptions,
}: LedgerScreenProps) {
  const [direction, setDirection] = useState("all");
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [property, setProperty] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState(
    initialEntryId ?? entries[0]?.id ?? "",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return filterLedgerEntries(entries, {
      direction,
      propertyId: property,
      query,
    });
  }, [direction, entries, property, query]);

  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedEntryId) ??
    filteredEntries[0] ??
    null;

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            <Button>
              <Download size={15} />
              Export
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
        <div className="px-8 pt-5">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <LedgerFilters
        direction={direction}
        onDirectionChange={setDirection}
        onPropertyChange={setProperty}
        onQueryChange={setQuery}
        properties={propertyOptions}
        property={property}
        query={query}
      />

      <div className="space-y-5 p-8">
        <LedgerSummary snapshot={snapshot} />
        <RecentChangesPanel changes={recentChanges} />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <LedgerTable
            entries={filteredEntries}
            onArchiveEntry={(entry) => {
              setStatusMessage(null);
              setDrawerState({ entry, mode: "archive" });
            }}
            onEditEntry={(entry) => {
              setStatusMessage(null);
              setDrawerState({ entry, mode: "edit" });
            }}
            onSelectEntry={setSelectedEntryId}
            selectedEntryId={selectedEntry?.id ?? ""}
          />
          <LedgerInspector
            entry={selectedEntry}
            onArchiveEntry={(entry) => {
              setStatusMessage(null);
              setDrawerState({ entry, mode: "archive" });
            }}
            onEditEntry={(entry) => {
              setStatusMessage(null);
              setDrawerState({ entry, mode: "edit" });
            }}
          />
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
              onEdit={() => setDrawerState({ entry: drawerState.entry, mode: "edit" })}
              onSuccess={setStatusMessage}
            />
          ) : (
            <LedgerEntryForm
              entry={drawerState.entry}
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

  return "Archive ledger entry";
}

function getLedgerDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "add") {
    return "New entries create a linked timeline record automatically.";
  }

  if (drawer.mode === "edit") {
    return "Update the financial record and keep its linked timeline event in sync.";
  }

  return "Hide this entry from ledger totals and archive the linked timeline event when present.";
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
      <div className="flex-1 space-y-4 px-5 py-5">
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

      <div className="border-t border-border px-5 py-4">
        <div className="flex justify-end gap-2">
          <Button onClick={onEdit}>
            Edit instead
          </Button>
          <Button disabled={pending} type="submit" variant="primary">
            <Archive size={15} />
            {pending ? "Archiving..." : "Archive entry"}
          </Button>
        </div>
      </div>
    </form>
  );
}
