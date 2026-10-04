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
} from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
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
    <div
      aria-label="Timeline table"
      className="min-w-0 md:overflow-x-auto"
      role="region"
      data-slot="timeline-table-shell"
    >
        <table className="block w-full md:table md:min-w-[840px] md:table-fixed border-collapse text-left text-sm">
          <colgroup className="hidden md:table-column-group">
            <col className="w-[108px]" />
            <col className="w-[126px]" />
            <col />
            <col className="w-[156px]" />
            <col className="w-[132px]" />
            <col className="w-[74px]" />
          </colgroup>
          <thead className="hidden md:table-header-group sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs uppercase tracking-[0] text-muted-foreground shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Record</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
              <th className="px-3 py-2.5 text-right font-semibold">Preview</th>
            </tr>
          </thead>
          <tbody className="grid gap-3 md:table-row-group">
            {events.map((event) => (
              <tr
                aria-selected={selectedEventId === event.id}
                className={cn(
                  previewRowClassName,
                  selectedEventId === event.id && selectedPreviewRowClassName,
                  event.archivedAt && "text-muted-foreground",
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
                <td className="block px-0 py-0 text-muted-foreground md:table-cell md:whitespace-nowrap md:px-3 md:py-2">
                  {formatDate(event.eventDate)}
                </td>
                <td className="block min-w-0 px-0 py-0 md:table-cell md:px-3 md:py-2">
                  <EventTypeBadge type={event.eventType} />
                </td>
                <td className="order-first block min-w-0 px-0 py-0 md:table-cell md:px-4 md:py-2">
                  <div className="flex items-center gap-2.5">
                    <Link
                      className="min-w-0 whitespace-normal [overflow-wrap:anywhere] rounded-sm font-medium text-primary outline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      href={event.hrefs.timeline}
                      onClick={(linkEvent) => linkEvent.stopPropagation()}
                    >
                      {event.title}
                    </Link>
                    {event.hasAttachment ? (
                      <FileText
                        className="shrink-0 text-muted-foreground"
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
                <td className="block min-w-0 px-0 py-0 md:table-cell md:px-3 md:py-2">
                  <p className="whitespace-normal [overflow-wrap:anywhere] font-medium" title={event.propertyCode}>
                    {event.propertyCode}
                  </p>
                  {event.unitNumber ? (
                    <p className="mt-0.5 whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground">
                      Unit {event.unitNumber}
                    </p>
                  ) : null}
                </td>
                <td className="block px-0 py-0 font-medium md:table-cell md:px-3 md:py-2 md:text-right">
                  <span className="mb-1 block text-xs text-muted-foreground md:hidden">Cost</span>
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
                <td className="block px-0 py-0 align-middle md:table-cell md:px-3 md:py-2 md:text-right">
                  <Button
                    aria-label={`Preview ${event.title}`}
                    aria-pressed={selectedEventId === event.id}
                    className="h-8 w-full gap-1.5 px-2 md:w-8 md:px-0"
                    onClick={(buttonEvent) => {
                      buttonEvent.stopPropagation();
                      onSelectEvent(event.id);
                    }}
                    title={`Preview ${event.title}`}
                    variant="ghost"
                  >
                    <Eye size={15} /><span className="md:hidden">Preview</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
