import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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

      <select
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        onChange={(event) => onPropertyChange(event.target.value)}
        value={property}
      >
        <option value="all">All properties</option>
        {properties.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      <select
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        onChange={(event) => onEventTypeChange(event.target.value)}
        value={eventType}
      >
        <option value="all">All event types</option>
        {eventTypes.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <select
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        onChange={(event) =>
          onArchiveStateChange(event.target.value as ArchiveState)
        }
        value={archiveState}
      >
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="all">All records</option>
      </select>
    </div>
  );
}
