import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import type { TimelinePropertyOption } from "@/features/timeline/timeline.types";

type ArchiveState = "active" | "archived" | "all";

type TimelineFiltersProps = {
  archiveState: ArchiveState;
  eventTypes: string[];
  properties: TimelinePropertyOption[];
  eventType: string;
  property: string;
  query: string;
  onArchiveStateChange: (value: ArchiveState) => void;
  onEventTypeChange: (value: string) => void;
  onPropertyChange: (value: string) => void;
  onQueryChange: (value: string) => void;
};

export function TimelineFilters({
  archiveState,
  eventTypes,
  properties,
  eventType,
  property,
  query,
  onArchiveStateChange,
  onEventTypeChange,
  onPropertyChange,
  onQueryChange,
}: TimelineFiltersProps) {
  return (
    <div className="grid gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6 lg:grid-cols-[minmax(260px,1fr)_minmax(180px,240px)_minmax(170px,220px)_minmax(130px,160px)] lg:px-8">
      <label className="relative min-w-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          size={16}
        />
        <Input
          className="pl-9"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search history, property, unit, document"
          value={query}
        />
      </label>

      <SelectControl
        ariaLabel="Filter by property"
        onValueChange={onPropertyChange}
        options={[
          { label: "All properties", value: "all" },
          ...properties.map((item) => ({
            label: item.label,
            value: item.id,
          })),
        ]}
        value={property}
      />

      <SelectControl
        ariaLabel="Filter by event type"
        onValueChange={onEventTypeChange}
        options={[
          { label: "All event types", value: "all" },
          ...eventTypes.map((item) => ({ label: item, value: item })),
        ]}
        value={eventType}
      />

      <SelectControl
        ariaLabel="Filter by archive state"
        onValueChange={(value) => onArchiveStateChange(value as ArchiveState)}
        options={[
          { label: "Active", value: "active" },
          { label: "Archived", value: "archived" },
          { label: "All records", value: "all" },
        ]}
        value={archiveState}
      />
    </div>
  );
}
