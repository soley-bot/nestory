import Link from "next/link";
import {
  Archive,
  CalendarDays,
  ExternalLink,
  Landmark,
  Pencil,
  ReceiptText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";

type LedgerInspectorProps = {
  entry: LedgerEntry | null;
  onArchiveEntry: (entry: LedgerEntry) => void;
  onEditEntry: (entry: LedgerEntry) => void;
};

export function LedgerInspector({
  entry,
  onArchiveEntry,
  onEditEntry,
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

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-3">
          <DirectionBadge direction={entry.direction} />
          <Badge>{entry.propertyCode}</Badge>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          {entry.category}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {entry.description || "No description recorded."}
        </p>
        <p className="mt-4 text-2xl font-semibold tracking-tight">
          {entry.direction === "expense" ? "-" : ""}
          {formatMoney(entry.amount, entry.currency)}
        </p>
      </div>

      <div className="space-y-5 p-5 text-sm">
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
      </div>

      <div className="border-t border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Linked timeline
        </p>
        <div className="mt-3 rounded-md border border-border px-3 py-2 text-sm">
          {entry.relatedTimelineEvent ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{entry.relatedTimelineEvent.title}</p>
                <p className="mt-1 text-xs text-muted">
                  Edits and archives from Ledger keep this timeline event in sync.
                </p>
              </div>
              <Link
                className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                href="/timeline"
              >
                <ExternalLink size={14} />
                View
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

      <div className="border-t border-border p-5">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onEditEntry(entry)}>
            <Pencil size={15} />
            Edit
          </Button>
          <Button onClick={() => onArchiveEntry(entry)}>
            <Archive size={15} />
            Archive
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          Archiving from Ledger hides this entry from totals and archives the
          linked timeline event when one exists.
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
