"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Plus, RotateCcw, Upload } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DOCUMENT_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { SideDrawer } from "@/components/ui/side-drawer";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceSplitView } from "@/components/layout/workspace-split-view";
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
import {
  DEFAULT_TIMELINE_PAGE_SIZE,
  DEFAULT_TIMELINE_SORT,
} from "@/features/timeline/timeline.filters";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelinePagination,
  TimelinePropertyOption,
  TimelineScope,
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
  eventTypes: TimelineEventType[];
  events: TimelineEvent[];
  initialEventId?: string;
  pagination: TimelinePagination;
  propertyOptions: TimelinePropertyOption[];
  recentChanges: RecentChange[];
  scope: TimelineScope;
  title?: string;
  unitOptions: TimelineUnitOption[];
  viewQuery: TimelineViewQuery;
};

export function TimelineScreen({
  eventTypes,
  events,
  initialEventId,
  pagination,
  propertyOptions,
  recentChanges,
  scope,
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
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
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
    setCompactInspectorOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setCompactInspectorOpen(true);
  };

  useEffect(() => {
    if (!focusedEventId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedEventId(focusedEventId);
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

  const hasFilters =
    viewQuery.archiveState !== "active" ||
    Boolean(viewQuery.dateFrom) ||
    Boolean(viewQuery.dateTo) ||
    viewQuery.eventType !== "all" ||
    viewQuery.pageSize !== DEFAULT_TIMELINE_PAGE_SIZE ||
    viewQuery.propertyId !== "all" ||
    viewQuery.query.trim() !== "" ||
    viewQuery.sort !== DEFAULT_TIMELINE_SORT ||
    (viewQuery.unitId ?? "all") !== "all";
  const openCreate = () =>
    openTimelineAction({
      event: null,
      initialValues: createInitialValues,
      mode: "create",
    });
  const timelineList = (
    <section className="flex min-w-0 flex-col bg-card">
      {events.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={pathname}
                scroll={false}
              >
                Clear filters
              </Link>
            ) : undefined
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching timeline events" : "No timeline events yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <TimelineTable
              events={events}
              onSelectEvent={previewEvent}
              selectedEventId={compactInspectorOpen ? selectedEvent?.id ?? "" : ""}
            />
          </div>
          <PaginationControls pagination={pagination} />
        </>
      )}
    </section>
  );
  const timelineInspector = selectedEvent ? (
    <TimelineInspector
      event={selectedEvent}
      onAttachDocument={(event) =>
        openTimelineAction({ event, mode: "document" })
      }
      onArchive={(event) => openTimelineAction({ event, mode: "archive" })}
      onEdit={(event) => openTimelineAction({ event, mode: "edit" })}
      onRestore={(event) => openTimelineAction({ event, mode: "restore" })}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        <>
          <RecentChangesPopover
            changes={recentChanges}
            onSelectChange={(change) => {
              openTimelineAction({ change, mode: "activity" });
            }}
          />
          <Button onClick={openCreate} variant="default">
            <Plus size={15} />
            Add event
          </Button>
        </>
      }
      breadcrumbCurrent={pathname === "/timeline" ? "Records" : title}
      breadcrumbItems={
        pathname === "/timeline"
          ? undefined
          : [{ href: "/timeline", label: "Records" }]
      }
      context={<span>{getTimelineScopeLabel(scope)}</span>}
      contextHref={pathname}
      title={title}
      toolbar={
        <TimelineFilters
          eventTypes={eventTypes}
          properties={propertyOptions}
          units={unitOptions}
          viewQuery={viewQuery}
        />
      }
    >
      <div className="flex min-w-0 flex-col">
        {statusMessage ? (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <p
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
              role="status"
            >
              {statusMessage}
            </p>
          </div>
        ) : null}

        {reviewContext ? (
          <TimelineReviewStrip context={reviewContext} />
        ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {timelineInspector && selectedEvent ? (
            <WorkspaceSplitView
              inspector={timelineInspector}
              inspectorLabel={`${selectedEvent.title} timeline quick view`}
              inspectorOpen={compactInspectorOpen}
              list={timelineList}
              onInspectorOpenChange={setCompactInspectorOpen}
            />
          ) : (
            <WorkspaceSplitView list={timelineList} />
          )}
        </div>

        {drawer ? (
          <SideDrawer
            description={getTimelineDrawerDescription(drawer.mode)}
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
    </WorkspacePage>
  );
}

export function getTimelineScopeLabel(scope: TimelineScope) {
  if (scope === "property") {
    return "Property records";
  }

  if (scope === "maintenance") {
    return "Maintenance records";
  }

  if (scope === "financial") {
    return "Financial records";
  }

  return "All history";
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

export function getTimelineDrawerDescription(
  mode: "create" | "edit" | "archive" | "restore" | "document" | "activity",
) {
  if (mode === "archive") {
    return "Hides this record from normal timeline views while keeping audit history.";
  }

  if (mode === "activity") {
    return "Before and after values recorded in the activity log.";
  }

  return undefined;
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

export type TimelineReviewContext = {
  detail?: string;
  suffix: string;
};

type FocusedTimelineState = {
  hasFocusedEvent: boolean;
  hasFocusedEventIntent: boolean;
};

function TimelineReviewStrip({
  context,
}: {
  context: TimelineReviewContext;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-2 text-sm sm:px-6"
      data-slot="timeline-review-context"
    >
      <p className="font-medium text-foreground">{context.suffix}</p>
      {context.detail ? (
        <p className="text-xs text-muted-foreground">{context.detail}</p>
      ) : null}
    </div>
  );
}

export function getTimelineReviewContext(
  focusedState: FocusedTimelineState,
): TimelineReviewContext | null {
  if (focusedState.hasFocusedEvent) {
    return {
      suffix: "Opened from activity history · Archived records included",
    };
  }

  if (focusedState.hasFocusedEventIntent) {
    return {
      detail: "The event may be outside the current filters or access scope.",
      suffix: "Source event unavailable",
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
        <div className="rounded-md border border-border bg-muted p-4">
          <p className="text-sm font-medium text-foreground">{event.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.propertyCode}
            {event.unitNumber ? ` / Unit ${event.unitNumber}` : ""}
          </p>
        </div>
        {state.message ? (
          <p
            className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm"
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
          variant="default"
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
        <div className="mb-4 flex items-center gap-2 text-primary">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <div className="rounded-md border border-border bg-muted p-4">
          <p className="text-sm font-medium text-foreground">{event.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.propertyCode}
            {event.unitNumber ? ` / Unit ${event.unitNumber}` : ""}
          </p>
        </div>
        <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Restoring makes this record visible in normal timeline views again.
        </p>
        {state.message ? (
          <p
            className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm"
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
          variant="default"
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
    <form action={action} className="flex h-full flex-col">
      <input name="eventId" type="hidden" value={event.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-muted px-3 py-3">
          <p className="text-sm font-medium">{event.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
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

        {state.message ? (
          <p
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
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
          variant="default"
        >
          <Upload size={15} />
          {pending ? "Uploading..." : "Attach document"}
        </Button>
      </div>
    </form>
  );
}
