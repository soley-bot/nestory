import Link from "next/link";
import {
  Archive,
  CalendarDays,
  ExternalLink,
  Landmark,
  Lock,
  Pencil,
  ReceiptText,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/features/documents/components/document-list";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";

type LedgerInspectorProps = {
  entry: LedgerEntry | null;
  onArchiveEntry: (entry: LedgerEntry) => void;
  onAttachReceipt: (entry: LedgerEntry) => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onRestoreEntry: (entry: LedgerEntry) => void;
};

export function LedgerInspector({
  entry,
  onArchiveEntry,
  onAttachReceipt,
  onEditEntry,
  onRestoreEntry,
}: LedgerInspectorProps) {
  if (!entry) {
    return (
      <aside className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight">
          No ledger entry selected
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Select a row to inspect transaction details, property context, and linked
          timeline status.
        </p>
      </aside>
    );
  }

  const isArchived = Boolean(entry.archivedAt);

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DirectionBadge direction={entry.direction} />
          <div className="flex flex-wrap items-center gap-2">
            {isArchived ? <Badge tone="warning">Archived</Badge> : null}
            {entry.isLocked ? (
              <Badge tone="warning">
                <Lock size={12} />
                Locked
              </Badge>
            ) : null}
            <Badge>{entry.propertyCode}</Badge>
          </div>
        </div>
        <h2 className="mt-4 break-words text-lg font-semibold tracking-tight">
          {entry.category}
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted">
          {entry.description || "No description recorded."}
        </p>
        <p className="mt-4 break-words text-2xl font-semibold tracking-tight">
          {entry.direction === "expense" ? "-" : ""}
          {formatMoney(entry.amount, entry.currency)}
        </p>
      </div>

      <div className="space-y-5 p-4 text-sm sm:p-5">
        <InspectorRow icon={<CalendarDays size={16} />} label="Transaction date">
          {formatDate(entry.transactionDate)}
        </InspectorRow>
        <InspectorRow icon={<Landmark size={16} />} label="Property">
          {entry.propertyName}
          {entry.unitNumber ? (
            <span className="block text-muted">Unit {entry.unitNumber}</span>
          ) : (
            <span className="block text-muted">Property level</span>
          )}
        </InspectorRow>
        <InspectorRow icon={<ReceiptText size={16} />} label="Ledger id">
          <span className="font-mono text-xs">{entry.id}</span>
        </InspectorRow>
        {entry.archivedAt ? (
          <InspectorRow icon={<Archive size={16} />} label="Archived">
            {formatDate(entry.archivedAt)}
          </InspectorRow>
        ) : null}
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Linked timeline
        </p>
        <div className="mt-3 rounded-md border border-border px-3 py-2 text-sm">
          {entry.relatedTimelineEvent ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {entry.relatedTimelineEvent.title}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Edits and archives from Ledger keep this timeline event in sync.
                </p>
              </div>
              <Link
                className="inline-flex min-h-8 items-center justify-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                href={`/timeline?eventId=${encodeURIComponent(
                  entry.relatedTimelineEvent.id,
                )}`}
              >
                <ExternalLink size={14} />
                View exact event
              </Link>
            </div>
          ) : (
            <p className="text-muted">
              No linked timeline record was found. Saving an edit will recreate
              the missing timeline link.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="mb-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Receipts
            </p>
            {!isArchived ? (
              <Button onClick={() => onAttachReceipt(entry)} variant="ghost">
                <Upload size={15} />
                Attach
              </Button>
            ) : null}
          </div>
          <DocumentList
            documents={entry.documents}
            emptyLabel="No receipts attached yet."
          />
        </div>
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {isArchived ? (
            <Button
              className="col-span-2"
              disabled={entry.isLocked}
              onClick={() => onRestoreEntry(entry)}
              title={
                entry.isLocked ? "This accounting period is locked." : undefined
              }
              variant="primary"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <>
              <Button
                disabled={entry.isLocked}
                onClick={() => onEditEntry(entry)}
                title={
                  entry.isLocked ? "This accounting period is locked." : undefined
                }
              >
                <Pencil size={15} />
                Edit
              </Button>
              <Button
                disabled={entry.isLocked}
                onClick={() => onArchiveEntry(entry)}
                title={
                  entry.isLocked ? "This accounting period is locked." : undefined
                }
              >
                <Archive size={15} />
                Archive
              </Button>
            </>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          {entry.isLocked
            ? "This entry belongs to a locked accounting period. Unlock the period before editing, archiving, or restoring it."
            : "Archiving from Ledger hides this entry from totals and archives the linked timeline event when one exists."}
        </p>
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

function DirectionBadge({ direction }: { direction: LedgerEntry["direction"] }) {
  if (direction === "income") {
    return <Badge tone="success">Income</Badge>;
  }

  return <Badge tone="warning">Expense</Badge>;
}
