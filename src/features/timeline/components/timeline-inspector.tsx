import { CalendarDays, FileText, Landmark, Link2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type { TimelineEvent } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";

export function TimelineInspector({ event }: { event: TimelineEvent | null }) {
  if (!event) {
    return (
      <aside className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight">No record selected</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Select a timeline record to inspect its property, unit, cost, and linked
          records.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-3">
          <EventTypeBadge type={event.eventType} />
          <Badge>{event.propertyCode}</Badge>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          {event.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">{event.description}</p>
      </div>

      <div className="space-y-5 p-5 text-sm">
        <InspectorRow icon={<CalendarDays size={16} />} label="Event date">
          {formatDate(event.eventDate)}
        </InspectorRow>
        <InspectorRow icon={<Landmark size={16} />} label="Property">
          {event.propertyName}
          {event.unitNumber ? (
            <span className="block text-muted">Unit {event.unitNumber}</span>
          ) : null}
        </InspectorRow>
        <InspectorRow icon={<UserRound size={16} />} label="Created by">
          {event.createdBy}
        </InspectorRow>
        <InspectorRow icon={<Landmark size={16} />} label="Cost">
          {event.cost && event.currency
            ? formatMoney(event.cost, event.currency)
            : "No cost recorded"}
        </InspectorRow>
      </div>

      <div className="border-t border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Linked records
        </p>
        <div className="mt-3 space-y-2">
          {event.relatedDocument ? (
            <LinkedRecord icon={<FileText size={15} />} label={event.relatedDocument} />
          ) : null}
          {event.relatedLease ? (
            <LinkedRecord icon={<Link2 size={15} />} label={event.relatedLease} />
          ) : null}
          {event.relatedLedgerEntry ? (
            <LinkedRecord
              icon={<Landmark size={15} />}
              label={event.relatedLedgerEntry}
            />
          ) : null}
          {!event.relatedDocument &&
          !event.relatedLease &&
          !event.relatedLedgerEntry ? (
            <p className="text-sm text-muted">No linked records yet.</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function InspectorRow({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-muted">{icon}</div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
          {label}
        </p>
        <div className="mt-1 text-foreground">{children}</div>
      </div>
    </div>
  );
}

function LinkedRecord({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
