import Link from "next/link";
import {
  Archive,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
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
import { formatMoneyDisplay } from "@/lib/money/format";

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
      <aside className="bg-surface p-4">
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
    <aside className="bg-surface">
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
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-muted"
              href={event.hrefs.ledger ?? event.hrefs.timeline}
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
        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                Next action
              </p>
              <p className="mt-1 font-semibold">{event.nextAction.label}</p>
            </div>
            <Badge tone={event.nextAction.tone}>
              {getRiskBadgeLabel(event.nextAction.tone)}
            </Badge>
          </div>
          <p className="mt-2 leading-6 text-muted">
            {event.nextAction.description}
          </p>
          <Link
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
            href={event.nextAction.href}
          >
            Open action
            <ExternalLink size={13} />
          </Link>
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Risk
          </p>
          <div className="mt-2 space-y-2">
            {event.riskIndicators.map((risk) => (
              <RiskRow key={risk.id} risk={risk} />
            ))}
          </div>
        </section>

        <InspectorRow icon={<CalendarDays size={16} />} label="Event date">
          {formatDate(event.eventDate)}
        </InspectorRow>
        <InspectorRow icon={<Landmark size={16} />} label="Property">
          <Link
            className="font-medium text-accent hover:underline"
            href={event.hrefs.property}
          >
            {event.propertyName}
          </Link>
          {event.unitNumber ? (
            <Link
              className="block text-muted hover:text-accent hover:underline"
              href={event.hrefs.unit ?? event.hrefs.property}
            >
              Unit {event.unitNumber}
            </Link>
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
            <LinkedRecord
              href={event.hrefs.lease}
              icon={<Link2 size={15} />}
              label={event.relatedLease}
            />
          ) : null}
          {event.relatedLedgerEntry ? (
            <LinkedRecord
              icon={<Landmark size={15} />}
              label={`Ledger entry: ${event.relatedLedgerEntry}`}
              href={event.hrefs.ledger}
            />
          ) : null}
          {!event.relatedLease && !event.relatedLedgerEntry ? (
            <p className="text-sm text-muted">No linked records yet.</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            History
          </p>
          <Badge>{event.recordCounts.activity}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {event.activity.length === 0 ? (
            <MiniRow label="Activity" value="No event activity logged yet." />
          ) : (
            event.activity.slice(0, 4).map((change) => (
              <Link
                className="block rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-surface-muted"
                href={change.href}
                key={change.id}
              >
                <MiniRow
                  label={`${change.actionLabel} / ${change.entityLabel}`}
                  value={`${change.recordLabel} / ${formatDate(change.createdAt)}`}
                />
              </Link>
            ))
          )}
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

function RiskRow({
  risk,
}: {
  risk: TimelineEvent["riskIndicators"][number];
}) {
  const Icon =
    risk.tone === "success"
      ? CheckCircle2
      : risk.tone === "danger" || risk.tone === "warning"
        ? AlertTriangle
        : CalendarDays;

  return (
    <div className="flex min-w-0 gap-2 rounded-md border border-border px-2.5 py-2">
      <Icon className="mt-0.5 shrink-0 text-muted" size={14} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{risk.label}</p>
          <Badge className="px-2 text-xs" tone={risk.tone}>
            {getRiskBadgeLabel(risk.tone)}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          {risk.description}
        </p>
      </div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="truncate font-medium" title={label}>
        {label}
      </p>
      <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted">
        {value}
      </p>
    </div>
  );
}

function getRiskBadgeLabel(tone: TimelineEvent["riskIndicators"][number]["tone"]) {
  if (tone === "success") {
    return "Ready";
  }

  if (tone === "danger") {
    return "Risk";
  }

  if (tone === "accent") {
    return "Linked";
  }

  return "Review";
}
