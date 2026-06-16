import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TimelinePropertyOption } from "@/features/timeline/timeline.types";

type TimelineFiltersProps = {
  eventTypes: string[];
  properties: TimelinePropertyOption[];
  eventType: string;
  property: string;
  query: string;
  onEventTypeChange: (value: string) => void;
  onPropertyChange: (value: string) => void;
  onQueryChange: (value: string) => void;
};

export function TimelineFilters({
  eventTypes,
  properties,
  eventType,
  property,
  query,
  onEventTypeChange,
  onPropertyChange,
  onQueryChange,
}: TimelineFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-8 py-4">
      <label className="relative min-w-72 flex-1">
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
        className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
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
        className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
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
    </div>
  );
}
