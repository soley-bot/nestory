"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
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

type TimelineScreenProps = {
  eventTypes: TimelineEventType[];
  events: TimelineEvent[];
  propertyOptions: TimelinePropertyOption[];
  snapshot: TimelineSnapshot;
  unitOptions: TimelineUnitOption[];
};

export function TimelineScreen({
  eventTypes,
  events,
  propertyOptions,
  snapshot,
  unitOptions,
}: TimelineScreenProps) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [property, setProperty] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");

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
            <Button onClick={() => setIsFormOpen(true)} variant="primary">
              <Plus size={15} />
              Add event
            </Button>
          </>
        }
        description="Search, filter, and inspect the full historical record across properties and units."
        title="Timeline History"
      />

      {isFormOpen ? (
        <TimelineEventForm
          eventTypes={eventTypes}
          onClose={() => setIsFormOpen(false)}
          properties={propertyOptions}
          units={unitOptions}
        />
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
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
          <TimelineTable
            events={filteredEvents}
            onSelectEvent={setSelectedEventId}
            selectedEventId={selectedEvent?.id ?? ""}
          />
          <TimelineInspector event={selectedEvent} />
        </div>
      </div>
    </div>
  );
}
