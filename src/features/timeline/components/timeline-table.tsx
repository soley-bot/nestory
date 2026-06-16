import { FileText, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[104px]" />
          <col className="w-[124px]" />
          <col />
          <col className="w-[136px]" />
          <col className="w-[112px]" />
        </colgroup>
        <thead className="bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Date</th>
            <th className="px-3 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Record</th>
            <th className="px-3 py-3 font-semibold">Property</th>
            <th className="px-3 py-3 text-right font-semibold">Cost</th>
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
                event.archivedAt && "text-muted",
              )}
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
            >
              <td className="whitespace-nowrap px-3 py-3 text-muted">
                {formatDate(event.eventDate)}
              </td>
              <td className="px-3 py-3">
                <EventTypeBadge type={event.eventType} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-foreground">
                      {event.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-muted">
                      {event.description || "No description recorded."}
                    </p>
                  </div>
                  {event.hasAttachment ? (
                    <FileText className="mt-0.5 shrink-0 text-muted" size={15} />
                  ) : null}
                </div>
                {event.archivedAt || event.isLocked ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {event.archivedAt ? <Badge tone="warning">Archived</Badge> : null}
                    {event.isLocked ? (
                      <Badge tone="warning">
                        <Lock size={12} />
                        Locked
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <p className="truncate font-medium" title={event.propertyCode}>
                  {event.propertyCode}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {event.unitNumber ? `Unit ${event.unitNumber}` : "Property"}
                </p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-medium">
                {event.cost !== undefined && event.currency
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
