"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Archive, Download, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { PageHeader } from "@/components/layout/page-header";
import { RecentChangesPanel } from "@/features/activity/components/recent-changes-panel";
import type { RecentChange } from "@/features/activity/activity.types";
import {
  archiveTimelineEventAction,
  type TimelineActionState,
} from "@/features/timeline/actions";
import { PropertyPerformanceSnapshot } from "@/features/timeline/components/property-performance-snapshot";
import { TimelineEventForm } from "@/features/timeline/components/timeline-event-form";
import { TimelineFilters } from "@/features/timeline/components/timeline-filters";
import { TimelineInspector } from "@/features/timeline/components/timeline-inspector";
import { TimelineTable } from "@/features/timeline/components/timeline-table";
import { filterTimelineEvents } from "@/features/timeline/timeline.filters";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelinePropertyOption,
  TimelineSnapshot,
  TimelineUnitOption,
} from "@/features/timeline/timeline.types";

const archiveInitialState: TimelineActionState = {};

type DrawerState =
  | { mode: "create"; event: null }
  | { mode: "edit"; event: TimelineEvent }
  | { mode: "archive"; event: TimelineEvent };

type TimelineScreenProps = {
  eventTypes: TimelineEventType[];
  events: TimelineEvent[];
  initialEventId?: string;
  propertyOptions: TimelinePropertyOption[];
  recentChanges: RecentChange[];
  snapshot: TimelineSnapshot;
  unitOptions: TimelineUnitOption[];
};

export function TimelineScreen({
  eventTypes,
  events,
  initialEventId,
  propertyOptions,
  recentChanges,
  snapshot,
  unitOptions,
}: TimelineScreenProps) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [property, setProperty] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState(
    initialEventId ?? events[0]?.id ?? "",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    return filterTimelineEvents(events, {
      eventType,
      propertyId: property,
      query,
    });
  }, [eventType, events, property, query]);

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedEventId) ??
    filteredEvents[0] ??
    null;

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            <Button>
              <Save size={15} />
              Save filter
            </Button>
            <Button>
              <Download size={15} />
              Export
            </Button>
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
        <div className="px-8 pt-5">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <TimelineFilters
        eventType={eventType}
        eventTypes={eventTypes}
        onEventTypeChange={setEventType}
        onPropertyChange={setProperty}
        onQueryChange={setQuery}
        properties={propertyOptions}
        property={property}
        query={query}
      />

      <div className="space-y-5 p-8">
        <PropertyPerformanceSnapshot snapshot={snapshot} />
        <RecentChangesPanel changes={recentChanges} />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <TimelineTable
            events={filteredEvents}
            onSelectEvent={setSelectedEventId}
            selectedEventId={selectedEvent?.id ?? ""}
          />
          <TimelineInspector
            archiveDisabled={false}
            event={selectedEvent}
            onArchive={(event) => {
              setStatusMessage(null);
              setDrawer({ event, mode: "archive" });
            }}
            onEdit={(event) => {
              setStatusMessage(null);
              setDrawer({ event, mode: "edit" });
            }}
          />
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

  return "Archive timeline event";
}

function getTimelineDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a compact historical record for a property or unit.";
  }

  if (drawer.mode === "edit") {
    return "Review and update the selected historical record.";
  }

  return "Hide this record from normal timeline views while keeping audit history.";
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
      <div className="flex-1 px-5 py-5">
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
      <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <Button onClick={onClose} type="button">
          Cancel
        </Button>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Archiving..." : "Archive event"}
        </Button>
      </div>
    </form>
  );
}
