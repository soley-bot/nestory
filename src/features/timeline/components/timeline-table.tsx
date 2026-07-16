import Link from "next/link";
import { Eye, FileText, Lock } from "lucide-react";
import {
  previewRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type {
  TimelineEvent,
  TimelinePagination,
} from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
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
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-col gap-1 border-b border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            Timeline records
          </h2>
          <p className="text-xs text-muted">
            {pagination.totalCount === 0
              ? "No matching records"
              : `${pagination.from}-${pagination.to} of ${pagination.totalCount}`}
          </p>
        </div>
      </div>
      <div className="max-h-[330px] overflow-auto md:max-h-[min(620px,calc(100vh-320px))]">
        <table className="w-full min-w-[840px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[108px]" />
            <col className="w-[126px]" />
            <col />
            <col className="w-[156px]" />
            <col className="w-[132px]" />
            <col className="w-[74px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Record</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
              <th className="px-3 py-2.5 text-right font-semibold">Preview</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                aria-selected={selectedEventId === event.id}
                className={cn(
                  previewRowClassName,
                  selectedEventId === event.id && selectedPreviewRowClassName,
                  event.archivedAt && "text-muted",
                )}
                key={event.id}
                onClick={(clickEvent) => {
                  clickEvent.currentTarget.focus();
                  onSelectEvent(event.id);
                }}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.currentTarget !== keyEvent.target) {
                    return;
                  }
                  if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                    keyEvent.preventDefault();
                    onSelectEvent(event.id);
                  }
                }}
                tabIndex={0}
              >
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {formatDate(event.eventDate)}
                </td>
                <td className="px-3 py-2">
                  <EventTypeBadge type={event.eventType} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <Link
                      className="min-w-0 truncate rounded-sm font-medium text-accent outline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      href={event.hrefs.timeline}
                      onClick={(linkEvent) => linkEvent.stopPropagation()}
                    >
                      {event.title}
                    </Link>
                    {event.hasAttachment ? (
                      <FileText
                        className="shrink-0 text-muted"
                        size={15}
                      />
                    ) : null}
                  </div>
                  {event.archivedAt || event.isLocked ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {event.archivedAt ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          Archived
                        </Badge>
                      ) : null}
                      {event.isLocked ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          <Lock size={12} />
                          Locked
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <p className="truncate font-medium" title={event.propertyCode}>
                    {event.propertyCode}
                  </p>
                  {event.unitNumber ? (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      Unit {event.unitNumber}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {event.cost !== undefined && event.currency
                    ? (
                        <MoneyDisplay
                          align="right"
                          value={formatMoneyDisplay(
                            event.cost,
                            event.currency,
                          )}
                        />
                      )
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right align-middle">
                  <Button
                    aria-label={`Preview ${event.title}`}
                    aria-pressed={selectedEventId === event.id}
                    className="h-8 w-8 px-0"
                    onClick={(buttonEvent) => {
                      buttonEvent.stopPropagation();
                      onSelectEvent(event.id);
                    }}
                    title={`Preview ${event.title}`}
                    variant="ghost"
                  >
                    <Eye size={15} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
