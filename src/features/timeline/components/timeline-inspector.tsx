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
import { DocumentList } from "@/features/documents/components/document-list";
import { EventTypeBadge } from "@/features/timeline/components/event-type-badge";
import type { TimelineEvent } from "@/features/timeline/timeline.types";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";

type TimelineInspectorProps = {
  archiveDisabled?: boolean;
  event: TimelineEvent | null;
  historyHref?: string;
  olderHistoryHref?: string;
  newerHistoryHref?: string;
  onSelectChange?: (change: RecentChange) => void;
  onAttachDocument?: (event: TimelineEvent) => void;
  onArchive?: (event: TimelineEvent) => void;
  onEdit?: (event: TimelineEvent) => void;
  onRestore?: (event: TimelineEvent) => void;
};

export function TimelineInspector({
  archiveDisabled = false,
  event,
  historyHref,
  olderHistoryHref,
  newerHistoryHref,
  onSelectChange,
  onAttachDocument,
  onArchive,
  onEdit,
  onRestore,
}: TimelineInspectorProps) {
  if (!event) {
    return null;
  }

  const isLedgerLinked = Boolean(event.ledgerEntryId);
  const isSourceLinked = event.sources.length > 0;
  const isArchived = Boolean(event.archivedAt);
  const isDisabled = event.isLocked || archiveDisabled;

  return (
    <div className="bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <EventTypeBadge type={event.eventType} />
            <h2 className="mt-3 [overflow-wrap:anywhere] text-base font-semibold">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CompactFact label="Date">{formatDate(event.eventDate)}</CompactFact>
          <CompactFact label="Cost">
            {event.cost !== undefined && event.currency ? (
              <MoneyDisplay value={formatMoneyDisplay(event.cost, event.currency)} />
            ) : (
              "No cost"
            )}
          </CompactFact>
        </div>

        <div className="rounded-md border border-border bg-muted/70 px-3 py-2.5">
          <p className="mb-2 font-semibold">Record context</p>
          <div className="space-y-1.5">
            <Link
              className="flex min-w-0 items-center justify-between gap-3 rounded border border-border bg-card px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={event.hrefs.property}
            >
              <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{event.propertyName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{event.propertyCode}</span>
            </Link>
            {event.hrefs.unit && event.unitNumber ? (
              <Link
                className="flex min-w-0 items-center justify-between gap-3 rounded border border-border bg-card px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={event.hrefs.unit}
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">Unit {event.unitNumber}</span>
                <ExternalLink className="shrink-0 text-primary" size={13} />
              </Link>
            ) : null}
            <Link
              className="flex min-w-0 items-center justify-between gap-3 rounded border border-border bg-card px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={event.hrefs.timeline}
            >
              <span>Open timeline event</span>
              <ExternalLink className="shrink-0 text-primary" size={13} />
            </Link>
          </div>
        </div>

        {event.sources.length > 0 ? (
          <section
            aria-label="Source records"
            className="rounded-md border border-border p-3"
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold">Source records</h3>
              <Badge>{event.sources.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {event.sources.map((source) =>
                source.availability === "available" ? (
                  <Link
                    aria-label={`Open ${source.moduleLabel} source ${source.label}`}
                    className="flex min-w-0 items-center justify-between gap-3 rounded border border-border px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    href={source.href}
                    key={`${source.entityType}:${source.entityId}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-muted-foreground">
                        {source.moduleLabel}
                      </span>
                      <span className="block whitespace-normal font-medium [overflow-wrap:anywhere]">
                        {source.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {source.isArchived ? (
                        <Badge tone="warning">Archived source</Badge>
                      ) : null}
                      <ExternalLink className="text-primary" size={13} />
                    </span>
                  </Link>
                ) : (
                  <div
                    className="rounded border border-border bg-muted/70 px-2.5 py-2"
                    key={`${source.entityType}:unavailable`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        {source.moduleLabel}
                      </span>
                      <Badge tone="neutral">Unavailable</Badge>
                    </div>
                    <p className="mt-1 font-medium [overflow-wrap:anywhere]">{source.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source record is unavailable or you no longer have access.
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        <section aria-label="Attachments" className="rounded-md border border-border p-3">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <h3 className="font-semibold">Attachments</h3>
            <Badge tone={event.documents.length > 0 ? "success" : "neutral"}>
              {event.documents.length}
            </Badge>
          </div>
          <DocumentList documents={event.documents} emptyLabel="No attachments" />
        </section>

        <section aria-label="Event history" className="rounded-md border border-border p-3">
          <h3 className="font-semibold">Event history</h3>
          {event.activityError ? (
            <>
              <p className="mt-2 text-sm [overflow-wrap:anywhere]" role="alert">{event.activityError}</p>
              {historyHref ? <a className="mt-2 inline-block underline underline-offset-4" href={historyHref}>Retry event history</a> : null}
            </>
          ) : event.activityPagination ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                {event.activityPagination.totalCount === 0
                  ? "No recorded event changes available."
                  : `Showing ${event.activity.length} recorded event changes, ${event.activityPagination.totalCount} available`}
              </p>
              <div className="mt-2 space-y-1.5">
                {event.activity.map((change) => (
                  <button
                    className="flex w-full min-w-0 items-start justify-between gap-3 rounded border border-border px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    key={change.id}
                    onClick={() => onSelectChange?.(change)}
                    type="button"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-medium">{change.actionLabel}</span><span className="block text-xs text-muted-foreground">{change.recordLabel}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(change.createdAt)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Older changes keep your place as new changes arrive. Refresh newest to see new entries; Newer changes returns to the newest entries.</p>
              {historyHref ? <a className="text-xs underline underline-offset-4" href={historyHref}>Refresh newest</a> : null}
              <nav aria-label="Event history pages" className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                {newerHistoryHref ? <Link className="underline underline-offset-4" href={newerHistoryHref} scroll={false}>Newer changes</Link> : null}
                {olderHistoryHref ? <Link className="underline underline-offset-4" href={olderHistoryHref} scroll={false}>Older changes</Link> : null}
              </nav>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">Event history is not fully loaded in this preview.</p>
              {historyHref ? <Link className="mt-2 inline-block underline underline-offset-4" href={historyHref} scroll={false}>Open event history</Link> : null}
            </>
          )}
        </section>
        <AttentionNote
          href={event.nextAction.href}
          item={getAttentionItem(event.riskIndicators)}
          label={event.nextAction.label}
        />

        <div className="grid gap-2 sm:grid-cols-3">
          {isLedgerLinked ? (
            <Link
              aria-label="Open linked ledger entry"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-sm font-medium transition-colors hover:bg-muted"
              href={event.hrefs.ledger ?? event.hrefs.timeline}
              title="Open linked ledger entry"
            >
              <Landmark size={15} />
              Ledger
            </Link>
          ) : null}
          {isArchived && onRestore ? (
            <Button
              aria-label="Restore timeline record"
              className={isLedgerLinked ? "sm:col-span-2" : "sm:col-span-3"}
              disabled={isDisabled}
              onClick={() => onRestore?.(event)}
              title={
                event.isLocked
                  ? "This month is locked."
                  : "Restore record"
              }
              type="button"
              variant="default"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : !isArchived ? (
            <>
              {onAttachDocument ? <Button
                aria-label="Attach document"
                className="px-2"
                onClick={() => onAttachDocument?.(event)}
                title="Attach document"
                type="button"
                variant="secondary"
              >
                <Upload size={15} />
                Attach
              </Button> : null}
              {!isLedgerLinked && !isSourceLinked ? (
                <>
                  {onEdit ? <Button
                    aria-label="Edit timeline record"
                    className="px-2"
                    disabled={isDisabled}
                    onClick={() => onEdit?.(event)}
                    title={
                      event.isLocked
                        ? "This month is locked."
                        : "Edit record"
                    }
                    type="button"
                    variant="secondary"
                  >
                    <Pencil size={15} />
                    Edit
                  </Button> : null}
                  {onArchive ? <Button
                    aria-label="Archive timeline record"
                    className="border-danger/40 px-2 text-danger hover:bg-muted"
                    disabled={isDisabled}
                    onClick={() => onArchive?.(event)}
                    title={
                      event.isLocked
                        ? "This month is locked."
                        : "Archive record"
                    }
                    type="button"
                    variant="secondary"
                  >
                    <Archive size={15} />
                    Archive
                  </Button> : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
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
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
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
    <div className="rounded-md border border-border bg-muted/70 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 whitespace-normal font-semibold [overflow-wrap:anywhere]">{item?.label ?? label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? "Review" : "Action"}
          </Badge>
          <Link
            aria-label="Open action"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-primary transition-colors hover:bg-muted"
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
