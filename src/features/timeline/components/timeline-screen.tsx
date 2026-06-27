"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Plus, RotateCcw, Upload } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityDetailPanel } from "@/features/activity/components/activity-detail-panel";
import { RecentChangesPopover } from "@/features/activity/components/recent-changes-popover";
import type { RecentChange } from "@/features/activity/activity.types";
import {
  archiveTimelineEventAction,
  attachTimelineDocumentAction,
  restoreTimelineEventAction,
  type TimelineActionState,
} from "@/features/timeline/actions";
import { TimelineEventForm } from "@/features/timeline/components/timeline-event-form";
import { TimelineFilters } from "@/features/timeline/components/timeline-filters";
import { TimelineInspector } from "@/features/timeline/components/timeline-inspector";
import { TimelineTable } from "@/features/timeline/components/timeline-table";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelinePagination,
  TimelinePropertyOption,
  TimelineUnitOption,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";
import type { CurrencyDisplaySettings } from "@/lib/money/format";

const archiveInitialState: TimelineActionState = {};
const documentInitialState: TimelineActionState = {};
const restoreInitialState: TimelineActionState = {};

type DrawerState =
  | { mode: "create"; event: null }
  | { mode: "edit"; event: TimelineEvent }
  | { mode: "archive"; event: TimelineEvent }
  | { mode: "restore"; event: TimelineEvent }
  | { mode: "document"; event: TimelineEvent }
  | { mode: "activity"; change: RecentChange };

type TimelineScreenProps = {
  currencySettings: CurrencyDisplaySettings;
  eventTypes: TimelineEventType[];
  events: TimelineEvent[];
  initialEventId?: string;
  pagination: TimelinePagination;
  propertyOptions: TimelinePropertyOption[];
  recentChanges: RecentChange[];
  unitOptions: TimelineUnitOption[];
  viewQuery: TimelineViewQuery;
};

export function TimelineScreen({
  currencySettings,
  eventTypes,
  events,
  initialEventId,
  pagination,
  propertyOptions,
  recentChanges,
  unitOptions,
  viewQuery,
}: TimelineScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { event: null, mode: "create" }
      : null,
  );
  const [selectedEventId, setSelectedEventId] = useState(initialEventId ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedEvent =
    (initialEventId
      ? events.find((event) => event.id === initialEventId)
      : null) ??
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ event: null, mode: "create" });
    });
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
                setDrawer({ change, mode: "activity" });
              }}
            />
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawer({ event: null, mode: "create" });
              }}
              variant="primary"
            >
              <Plus size={15} />
              Add event
            </Button>
          </>
        }
        description="Search, filter, and inspect the full historical record across properties and units."
        title="Timeline History"
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

      <TimelineFilters
        eventTypes={eventTypes}
        properties={propertyOptions}
        viewQuery={viewQuery}
      />

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <TimelineTable
              currencySettings={currencySettings}
              events={events}
              onSelectEvent={setSelectedEventId}
              pagination={pagination}
              selectedEventId={selectedEvent?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <div className="hidden 2xl:block">
            <TimelineInspector
              currencySettings={currencySettings}
              event={selectedEvent}
              onAttachDocument={(event) => {
                setStatusMessage(null);
                setDrawer({ event, mode: "document" });
              }}
              onArchive={(event) => {
                setStatusMessage(null);
                setDrawer({ event, mode: "archive" });
              }}
              onEdit={(event) => {
                setStatusMessage(null);
                setDrawer({ event, mode: "edit" });
              }}
              onRestore={(event) => {
                setStatusMessage(null);
                setDrawer({ event, mode: "restore" });
              }}
            />
          </div>
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getTimelineDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getTimelineDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchiveTimelineEventPanel
              event={drawer.event}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreTimelineEventPanel
              event={drawer.event}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "document" ? (
            <TimelineDocumentPanel
              event={drawer.event}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "activity" ? (
            <ActivityDetailPanel change={drawer.change} />
          ) : (
            <TimelineEventForm
              event={drawer.event}
              eventTypes={eventTypes}
              key={`${drawer.mode}-${drawer.event?.id ?? "new"}`}
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
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

function getTimelineDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Add timeline event";
  }

  if (drawer.mode === "edit") {
    return "Edit timeline event";
  }

  if (drawer.mode === "restore") {
    return "Restore timeline event";
  }

  if (drawer.mode === "document") {
    return "Attach document";
  }

  if (drawer.mode === "activity") {
    return "Change detail";
  }

  return "Archive timeline event";
}

function getTimelineDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a compact historical record for a property or unit.";
  }

  if (drawer.mode === "edit") {
    return "Review and update the selected historical record.";
  }

  if (drawer.mode === "restore") {
    return "Return this archived record to normal timeline views.";
  }

  if (drawer.mode === "document") {
    return "Attach a PDF or image to this historical record.";
  }

  if (drawer.mode === "activity") {
    return "Review the before and after values recorded in the activity log.";
  }

  return "Hide this record from normal timeline views while keeping audit history.";
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

function ArchiveTimelineEventPanel({
  event,
  onClose,
  onSuccess,
}: {
  event: TimelineEvent;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    archiveTimelineEventAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Timeline event archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="eventId" type="hidden" value={event.id} />
      <div className="flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4 flex items-center gap-2 text-danger">
          <Archive size={16} />
          <p className="text-sm font-semibold">Archive confirmation</p>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-4">
          <p className="text-sm font-medium text-foreground">{event.title}</p>
          <p className="mt-1 text-sm text-muted">
            {event.propertyCode}
            {event.unitNumber ? ` / Unit ${event.unitNumber}` : ""}
          </p>
        </div>
        {state.message ? (
          <p
            className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
        <Button className="w-full sm:w-auto" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant="primary"
        >
          {pending ? "Archiving..." : "Archive event"}
        </Button>
      </div>
    </form>
  );
}

function RestoreTimelineEventPanel({
  event,
  onClose,
  onSuccess,
}: {
  event: TimelineEvent;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    restoreTimelineEventAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Timeline event restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="eventId" type="hidden" value={event.id} />
      <div className="flex-1 px-4 py-5 sm:px-5">
        <div className="mb-4 flex items-center gap-2 text-accent">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-4">
          <p className="text-sm font-medium text-foreground">{event.title}</p>
          <p className="mt-1 text-sm text-muted">
            {event.propertyCode}
            {event.unitNumber ? ` / Unit ${event.unitNumber}` : ""}
          </p>
        </div>
        <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Restoring makes this record visible in normal timeline views again.
        </p>
        {state.message ? (
          <p
            className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
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
          {pending ? "Restoring..." : "Restore event"}
        </Button>
      </div>
    </form>
  );
}

function TimelineDocumentPanel({
  event,
  onClose,
  onSuccess,
}: {
  event: TimelineEvent;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    attachTimelineDocumentAction,
    documentInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Document attached.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form
      action={action}
      className="flex h-full flex-col"
      encType="multipart/form-data"
    >
      <input name="eventId" type="hidden" value={event.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-medium">{event.title}</p>
          <p className="mt-1 text-sm text-muted">
            {event.ledgerEntryId
              ? "This document will also appear on the linked ledger entry."
              : "This document is attached to the timeline event."}
          </p>
        </div>

        <label className="block text-sm font-medium">
          Document file
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-accent focus:ring-2 focus:ring-accent-soft"
            name="document"
            required
            type="file"
          />
          {state.fieldErrors?.document?.[0] ? (
            <p className="mt-1 text-xs text-danger">
              {state.fieldErrors.document[0]}
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

      <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
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
          {pending ? "Uploading..." : "Attach document"}
        </Button>
      </div>
    </form>
  );
}
