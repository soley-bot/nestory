import { FileText } from "lucide-react";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type { TimelineEvent } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type TimelineTableProps = {
  events: TimelineEvent[];
  selectedEventId: string;
  onSelectEvent: (id: string) => void;
};

export function TimelineTable({
  events,
  selectedEventId,
  onSelectEvent,
}: TimelineTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="w-32 px-4 py-3 font-semibold">Date</th>
            <th className="w-40 px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Record</th>
            <th className="w-44 px-4 py-3 font-semibold">Property</th>
            <th className="w-28 px-4 py-3 text-right font-semibold">Cost</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr className="border-t border-border">
              <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                No timeline records match the current filters.
              </td>
            </tr>
          ) : null}
          {events.map((event) => (
            <tr
              className={cn(
                "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70",
                selectedEventId === event.id && "bg-accent-soft",
              )}
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
            >
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatDate(event.eventDate)}
              </td>
              <td className="px-4 py-3">
                <EventTypeBadge type={event.eventType} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div>
                    <p className="font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 line-clamp-1 text-muted">
                      {event.description}
                    </p>
                  </div>
                  {event.hasAttachment ? (
                    <FileText className="mt-0.5 shrink-0 text-muted" size={15} />
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{event.propertyCode}</p>
                <p className="mt-1 text-xs text-muted">
                  {event.unitNumber ? `Unit ${event.unitNumber}` : "Property"}
                </p>
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {event.cost && event.currency
                  ? formatMoney(event.cost, event.currency)
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
