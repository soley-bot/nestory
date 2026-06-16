"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PropertyPerformanceSnapshot } from "@/features/timeline/components/property-performance-snapshot";
import { TimelineFilters } from "@/features/timeline/components/timeline-filters";
import { TimelineInspector } from "@/features/timeline/components/timeline-inspector";
import { TimelineTable } from "@/features/timeline/components/timeline-table";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelinePropertyOption,
  TimelineSnapshot,
} from "@/features/timeline/timeline.types";

type TimelineScreenProps = {
  eventTypes: TimelineEventType[];
  events: TimelineEvent[];
  propertyOptions: TimelinePropertyOption[];
  snapshot: TimelineSnapshot;
};

export function TimelineScreen({
  eventTypes,
  events,
  propertyOptions,
  snapshot,
}: TimelineScreenProps) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [property, setProperty] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      const matchesEventType =
        eventType === "all" || event.eventType === eventType;
      const matchesProperty =
        property === "all" || event.propertyId === property;
      const searchable = [
        event.title,
        event.description,
        event.propertyName,
        event.propertyCode,
        event.unitNumber,
        event.relatedDocument,
        event.relatedLease,
        event.relatedLedgerEntry,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesEventType &&
        matchesProperty &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
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
            <Button variant="primary">
              <Plus size={15} />
              Add event
            </Button>
          </>
        }
        description="Search, filter, and inspect the full historical record across properties and units."
        title="Timeline History"
      />

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
