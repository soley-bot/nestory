import Link from "next/link";
import {
  Archive,
  CalendarDays,
  FileText,
  Landmark,
  Link2,
  Pencil,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type { TimelineEvent } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";

type TimelineInspectorProps = {
  archiveDisabled?: boolean;
  event: TimelineEvent | null;
  onArchive?: (event: TimelineEvent) => void;
  onEdit?: (event: TimelineEvent) => void;
};

export function TimelineInspector({
  archiveDisabled = false,
  event,
  onArchive,
  onEdit,
}: TimelineInspectorProps) {
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

  const isLedgerLinked = Boolean(event.ledgerEntryId);

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
        <p className="mt-2 text-sm leading-6 text-muted">
          {event.description || "No description recorded."}
        </p>
      </div>

      {isLedgerLinked ? (
        <div className="border-b border-border p-5">
          <p className="text-sm leading-6 text-muted">
            This event is linked to a ledger entry. Edit or archive it from
            Ledger so totals and timeline history stay in sync.
          </p>
          <Link
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-muted"
            href={`/ledger?entryId=${encodeURIComponent(event.ledgerEntryId ?? "")}`}
          >
            <Landmark size={15} />
            Open linked ledger entry
          </Link>
        </div>
      ) : (
        <div className="flex gap-2 border-b border-border p-5">
          <Button
            className="flex-1"
            onClick={() => onEdit?.(event)}
            type="button"
            variant="secondary"
          >
            <Pencil size={15} />
            Edit
          </Button>
          <Button
            className="flex-1 border-danger/40 text-danger hover:bg-surface-muted"
            disabled={archiveDisabled}
            onClick={() => onArchive?.(event)}
            type="button"
            variant="secondary"
          >
            <Archive size={15} />
            Archive
          </Button>
        </div>
      )}

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
          {event.cost !== undefined && event.currency
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
              label={`Ledger entry: ${event.relatedLedgerEntry}`}
              href={`/ledger?entryId=${encodeURIComponent(event.ledgerEntryId ?? "")}`}
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
  href,
  icon,
  label,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
}) {
  if (href) {
    return (
      <Link
        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
        href={href}
      >
        <span className="text-muted">{icon}</span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
