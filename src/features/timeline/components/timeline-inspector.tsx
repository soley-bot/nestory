import Link from "next/link";
import {
  Archive,
  CalendarDays,
  Landmark,
  Link2,
  Lock,
  Pencil,
  RotateCcw,
  Upload,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/features/documents/components/document-list";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type { TimelineEvent } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";

type TimelineInspectorProps = {
  archiveDisabled?: boolean;
  event: TimelineEvent | null;
  onAttachDocument?: (event: TimelineEvent) => void;
  onArchive?: (event: TimelineEvent) => void;
  onEdit?: (event: TimelineEvent) => void;
  onRestore?: (event: TimelineEvent) => void;
};

export function TimelineInspector({
  archiveDisabled = false,
  event,
  onAttachDocument,
  onArchive,
  onEdit,
  onRestore,
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
  const isArchived = Boolean(event.archivedAt);
  const isDisabled = event.isLocked || archiveDisabled;

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <EventTypeBadge type={event.eventType} />
          <div className="flex flex-wrap items-center gap-2">
            {isArchived ? <Badge tone="warning">Archived</Badge> : null}
            {event.isLocked ? (
              <Badge tone="warning">
                <Lock size={12} />
                Locked
              </Badge>
            ) : null}
            <Badge>{event.propertyCode}</Badge>
          </div>
        </div>
        <h2 className="mt-4 break-words text-lg font-semibold tracking-tight">
          {event.title}
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted">
          {event.description || "No description recorded."}
        </p>
      </div>

      {isLedgerLinked ? (
        <div className="border-b border-border p-4 sm:p-5">
          <p className="text-sm leading-6 text-muted">
            This event is linked to a ledger entry. Edit, archive, or restore it
            from Ledger so totals and timeline history stay in sync.
          </p>
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <Link
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
              href={`/ledger?entryId=${encodeURIComponent(
                event.ledgerEntryId ?? "",
              )}`}
            >
              <Landmark size={15} />
              Open linked ledger entry
            </Link>
            {!isArchived ? (
              <Button onClick={() => onAttachDocument?.(event)}>
                <Upload size={15} />
                Attach document
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="border-b border-border p-4 sm:p-5">
          {isArchived ? (
            <Button
              className="w-full"
              disabled={isDisabled}
              onClick={() => onRestore?.(event)}
              title={
                event.isLocked ? "This accounting period is locked." : undefined
              }
              type="button"
              variant="primary"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                onClick={() => onAttachDocument?.(event)}
                type="button"
                variant="secondary"
              >
                <Upload size={15} />
                Attach
              </Button>
              <Button
                disabled={isDisabled}
                onClick={() => onEdit?.(event)}
                title={
                  event.isLocked ? "This accounting period is locked." : undefined
                }
                type="button"
                variant="secondary"
              >
                <Pencil size={15} />
                Edit
              </Button>
              <Button
                className="border-danger/40 text-danger hover:bg-surface-muted"
                disabled={isDisabled}
                onClick={() => onArchive?.(event)}
                title={
                  event.isLocked ? "This accounting period is locked." : undefined
                }
                type="button"
                variant="secondary"
              >
                <Archive size={15} />
                Archive
              </Button>
            </div>
          )}
          {event.isLocked ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              This record belongs to a locked accounting period. Unlock the
              period before editing, archiving, or restoring it.
            </p>
          ) : null}
        </div>
      )}

      <div className="space-y-5 p-4 text-sm sm:p-5">
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
        {event.archivedAt ? (
          <InspectorRow icon={<Archive size={16} />} label="Archived">
            {formatDate(event.archivedAt)}
          </InspectorRow>
        ) : null}
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="mb-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Documents
          </p>
          <DocumentList documents={event.documents} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Linked records
        </p>
        <div className="mt-3 space-y-2">
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
          {!event.relatedLease && !event.relatedLedgerEntry ? (
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
        className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
        href={href}
      >
        <span className="text-muted">{icon}</span>
        <span className="min-w-0 break-words">{label}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-muted">{icon}</span>
      <span className="min-w-0 break-words">{label}</span>
    </div>
  );
}
