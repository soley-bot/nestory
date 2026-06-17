import { FileText, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type {
  TimelineEvent,
  TimelinePagination,
} from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type TimelineTableProps = {
  events: TimelineEvent[];
  selectedEventId: string;
  onSelectEvent: (id: string) => void;
  pagination: TimelinePagination;
};

export function TimelineTable({
  events,
  selectedEventId,
  onSelectEvent,
  pagination,
}: TimelineTableProps) {
  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Timeline records
          </h2>
          <p className="text-xs text-muted">
            {pagination.totalCount === 0
              ? "No matching records"
              : `${pagination.from}-${pagination.to} of ${pagination.totalCount}`}
          </p>
        </div>
      </div>
      <div className="max-h-[680px] overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[104px]" />
            <col className="w-[124px]" />
            <col />
            <col className="w-[136px]" />
            <col className="w-[118px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted shadow-[0_1px_0_0_var(--color-border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Record</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
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
                aria-selected={selectedEventId === event.id}
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-soft",
                  selectedEventId === event.id && "bg-accent-soft",
                  event.archivedAt && "text-muted",
                )}
                key={event.id}
                onClick={() => onSelectEvent(event.id)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                    keyEvent.preventDefault();
                    onSelectEvent(event.id);
                  }
                }}
                tabIndex={0}
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                  {formatDate(event.eventDate)}
                </td>
                <td className="px-3 py-2.5">
                  <EventTypeBadge type={event.eventType} />
                </td>
                <td className="px-4 py-2.5">
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
                      <FileText
                        className="mt-0.5 shrink-0 text-muted"
                        size={15}
                      />
                    ) : null}
                  </div>
                  {event.archivedAt || event.isLocked ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {event.archivedAt ? (
                        <Badge tone="warning">Archived</Badge>
                      ) : null}
                      {event.isLocked ? (
                        <Badge tone="warning">
                          <Lock size={12} />
                          Locked
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <p className="truncate font-medium" title={event.propertyCode}>
                    {event.propertyCode}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {event.unitNumber ? `Unit ${event.unitNumber}` : "Property"}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                  {event.cost !== undefined && event.currency
                    ? formatMoney(event.cost, event.currency)
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
