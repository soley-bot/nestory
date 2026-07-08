"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Plus, RotateCcw, Upload } from "lucide-react";
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
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SideDrawer } from "@/components/ui/side-drawer";
import { PageHeader } from "@/components/layout/page-header";
import { removeActionSearchParam as getHrefWithoutActionParam } from "@/lib/url/href";
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

const archiveInitialState: TimelineActionState = {};
const documentInitialState: TimelineActionState = {};
const restoreInitialState: TimelineActionState = {};

type DrawerState =
  | {
      event: null;
      initialValues?: Partial<Pick<TimelineEvent, "propertyId" | "unitId">>;
      mode: "create";
    }
  | { mode: "edit"; event: TimelineEvent }
  | { mode: "archive"; event: TimelineEvent }
  | { mode: "restore"; event: TimelineEvent }
  | { mode: "document"; event: TimelineEvent }
  | { mode: "activity"; change: RecentChange };

type TimelineScreenProps = {
  description?: string;
  eventTypes: TimelineEventType[];
  events: TimelineEvent[];
  initialEventId?: string;
  pagination: TimelinePagination;
  propertyOptions: TimelinePropertyOption[];
  recentChanges: RecentChange[];
  title?: string;
  unitOptions: TimelineUnitOption[];
  viewQuery: TimelineViewQuery;
};

export function TimelineScreen({
  description = "Search, filter, and inspect the full historical record across properties and units.",
  eventTypes,
  events,
  initialEventId,
  pagination,
  propertyOptions,
  recentChanges,
  title = "Timeline History",
  unitOptions,
  viewQuery,
}: TimelineScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createInitialValues = useMemo(
    () => getTimelineCreateInitialValues(viewQuery, propertyOptions, unitOptions),
    [propertyOptions, unitOptions, viewQuery],
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { event: null, initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [selectedEventId, setSelectedEventId] = useState(() =>
    getInitialRecordId(events, initialEventId),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const focusedEvent = initialEventId
    ? events.find((event) => event.id === initialEventId) ?? null
    : null;
  const focusedEventId = focusedEvent?.id;
  const selectedEvent = getSelectedRecord({
    focusedRecordId: initialEventId,
    records: events,
    selectedRecordId: selectedEventId,
  });
  const reviewContext = getTimelineReviewContext({
    hasFocusedEvent: Boolean(focusedEvent),
    hasFocusedEventIntent: Boolean(initialEventId),
  });
  const openTimelineAction = (nextDrawer: DrawerState) => {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!focusedEventId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedEventId(focusedEventId);
      setPreviewOpen(true);
    });
  }, [focusedEventId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ event: null, initialValues: createInitialValues, mode: "create" });
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
                openTimelineAction({ change, mode: "activity" });
              }}
            />
            <Button
              onClick={() =>
                openTimelineAction({
                  event: null,
                  initialValues: createInitialValues,
                  mode: "create",
                })
              }
              variant="primary"
            >
              <Plus size={15} />
              Add event
            </Button>
          </>
        }
        description={description}
        title={title}
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
        units={unitOptions}
        viewQuery={viewQuery}
      />

      {reviewContext ? (
        <TimelineReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
        />
      ) : null}

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="min-w-0 space-y-0">
          <TimelineTable
            events={events}
            onSelectEvent={previewEvent}
            pagination={pagination}
            selectedEventId={selectedEvent?.id ?? ""}
          />
          <PaginationControls attached pagination={pagination} />
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedEvent)}
        title="Timeline preview"
      >
        <TimelineInspector
          event={selectedEvent}
          onAttachDocument={(event) =>
            openTimelineAction({ event, mode: "document" })
          }
          onArchive={(event) => openTimelineAction({ event, mode: "archive" })}
          onEdit={(event) => openTimelineAction({ event, mode: "edit" })}
          onRestore={(event) => openTimelineAction({ event, mode: "restore" })}
        />
      </RecordPreviewDrawer>

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
              initialValues={
                drawer.mode === "create" ? drawer.initialValues : undefined
              }
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

function getTimelineCreateInitialValues(
  viewQuery: TimelineViewQuery,
  properties: TimelinePropertyOption[],
  units: TimelineUnitOption[],
): Partial<Pick<TimelineEvent, "propertyId" | "unitId">> | undefined {
  const requestedUnit = viewQuery.unitId
    ? units.find((unit) => unit.id === viewQuery.unitId)
    : undefined;
  const propertyId =
    requestedUnit?.propertyId ??
    (viewQuery.propertyId !== "all" &&
    properties.some((property) => property.id === viewQuery.propertyId)
      ? viewQuery.propertyId
      : "");
  const unitId =
    requestedUnit && (!propertyId || requestedUnit.propertyId === propertyId)
      ? requestedUnit.id
      : "";

  if (!propertyId && !unitId) {
    return undefined;
  }

  return {
    propertyId,
    unitId,
  };
}

type TimelineReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
};

type FocusedTimelineState = {
  hasFocusedEvent: boolean;
  hasFocusedEventIntent: boolean;
};

function TimelineReviewStrip({
  context,
  count,
}: {
  context: TimelineReviewContext;
  count: number;
}) {
  return (
    <div className="border-b border-border bg-surface-muted/35 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "event" : "events"} {context.countLabel}
        </p>
        <p className="text-foreground-muted">{context.nextStep}</p>
      </div>
      <p className="mt-1 text-xs text-foreground-subtle">{context.description}</p>
    </div>
  );
}

function getTimelineReviewContext(
  focusedState: FocusedTimelineState,
): TimelineReviewContext | null {
  if (focusedState.hasFocusedEvent) {
    return {
      countLabel: "in this activity view",
      description: "Opened from recent activity with archived records included.",
      nextStep: "The focused event is available for table and inspector review.",
    };
  }

  if (focusedState.hasFocusedEventIntent) {
    return {
      countLabel: "in this activity view",
      description:
        "Opened from recent activity with archived records included, but this page did not include the focused event.",
      nextStep: "Review visible matches or broaden the current filters.",
    };
  }

  return null;
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
          <FileDropzoneField
            accept={DOCUMENT_FILE_ACCEPT}
            className="mt-2"
            description="PDF, JPG, PNG, or WebP up to 10 MB."
            name="document"
            required
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
