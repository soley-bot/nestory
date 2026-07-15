import Link from "next/link";
import {
  Archive,
  ExternalLink,
  Landmark,
  Lock,
  Pencil,
  RotateCcw,
  Upload,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

      <div className="space-y-4 p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <CompactFact label="Date">{formatDate(event.eventDate)}</CompactFact>
          <CompactFact label="Cost">
            {event.cost !== undefined && event.currency ? (
              <MoneyDisplay value={formatMoneyDisplay(event.cost, event.currency)} />
            ) : (
              "No cost"
            )}
          </CompactFact>
        </div>

        <AttentionNote
          href={event.nextAction.href}
          item={getAttentionItem(event.riskIndicators)}
          label={event.nextAction.label}
        />

        <div className="grid gap-2 sm:grid-cols-3">
          {isLedgerLinked ? (
            <Link
              aria-label="Open linked ledger entry"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-sm font-medium transition-colors hover:bg-surface-muted"
              href={event.hrefs.ledger ?? event.hrefs.timeline}
              title="Open linked ledger entry"
            >
              <Landmark size={15} />
              Ledger
            </Link>
          ) : null}
          {isArchived ? (
            <Button
              aria-label="Restore timeline record"
              className={isLedgerLinked ? "sm:col-span-2" : "sm:col-span-3"}
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
              Restore
            </Button>
          ) : (
            <>
              <Button
                aria-label="Attach document"
                className="px-2"
                onClick={() => onAttachDocument?.(event)}
                title="Attach document"
                type="button"
                variant="secondary"
              >
                <Upload size={15} />
                Attach
              </Button>
              {!isLedgerLinked ? (
                <>
                  <Button
                    aria-label="Edit timeline record"
                    className="px-2"
                    disabled={isDisabled}
                    onClick={() => onEdit?.(event)}
                    title={
                      event.isLocked
                        ? "This accounting period is locked."
                        : "Edit record"
                    }
                    type="button"
                    variant="secondary"
                  >
                    <Pencil size={15} />
                    Edit
                  </Button>
                  <Button
                    aria-label="Archive timeline record"
                    className="border-danger/40 px-2 text-danger hover:bg-surface-muted"
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
                    Archive
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function CompactFact({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 font-medium">{children}</div>
    </div>
  );
}

function AttentionNote({
  href,
  item,
  label,
}: {
  href: string;
  item?: TimelineEvent["riskIndicators"][number];
  label: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-semibold">{item?.label ?? label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? "Review" : "Action"}
          </Badge>
          <Link
            aria-label="Open action"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
            href={href}
            title="Open action"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function getAttentionItem(items: TimelineEvent["riskIndicators"]) {
  return items.find((item) => item.tone !== "success");
}
