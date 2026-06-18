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
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/features/documents/components/document-list";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type { TimelineEvent } from "@/features/timeline/timeline.types";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoneyDisplay,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";

type TimelineInspectorProps = {
  archiveDisabled?: boolean;
  currencySettings: CurrencyDisplaySettings;
  event: TimelineEvent | null;
  onAttachDocument?: (event: TimelineEvent) => void;
  onArchive?: (event: TimelineEvent) => void;
  onEdit?: (event: TimelineEvent) => void;
  onRestore?: (event: TimelineEvent) => void;
};

export function TimelineInspector({
  archiveDisabled = false,
  currencySettings,
  event,
  onAttachDocument,
  onArchive,
  onEdit,
  onRestore,
}: TimelineInspectorProps) {
  if (!event) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4 2xl:sticky 2xl:top-5">
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
    <aside className="rounded-md border border-border bg-surface 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-170px)] 2xl:overflow-auto">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <EventTypeBadge type={event.eventType} />
            <h2 className="mt-3 break-words text-base font-semibold">
              {event.title}
            </h2>
            <p className="mt-1 break-words text-sm leading-6 text-muted">
              {event.description || "No description recorded."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
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
      </div>

      {isLedgerLinked ? (
        <div className="border-b border-border p-4">
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
        <div className="border-b border-border p-4">
          {isArchived ? (
            <Button
              aria-label="Restore timeline record"
              className="w-full px-0"
              disabled={isDisabled}
              onClick={() => onRestore?.(event)}
              title={
                event.isLocked
                  ? "This accounting period is locked."
                  : "Restore record"
              }
              type="button"
              variant="primary"
            >
              <RotateCcw size={15} />
            </Button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                aria-label="Attach document"
                className="px-0"
                onClick={() => onAttachDocument?.(event)}
                title="Attach document"
                type="button"
                variant="secondary"
              >
                <Upload size={15} />
              </Button>
              <Button
                aria-label="Edit timeline record"
                className="px-0"
                disabled={isDisabled}
                onClick={() => onEdit?.(event)}
                title={
                  event.isLocked ? "This accounting period is locked." : "Edit record"
                }
                type="button"
                variant="secondary"
              >
                <Pencil size={15} />
              </Button>
              <Button
                aria-label="Archive timeline record"
                className="border-danger/40 px-0 text-danger hover:bg-surface-muted"
                disabled={isDisabled}
                onClick={() => onArchive?.(event)}
                title={
                  event.isLocked
                    ? "This accounting period is locked."
                    : "Archive record"
                }
                type="button"
                variant="secondary"
              >
                <Archive size={15} />
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

      <div className="space-y-4 p-4 text-sm">
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
            ? (
                <MoneyDisplay
                  value={formatMoneyDisplay(
                    event.cost,
                    event.currency,
                    currencySettings,
                  )}
                />
              )
            : "No cost recorded"}
        </InspectorRow>
        {event.archivedAt ? (
          <InspectorRow icon={<Archive size={16} />} label="Archived">
            {formatDate(event.archivedAt)}
          </InspectorRow>
        ) : null}
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-4">
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
