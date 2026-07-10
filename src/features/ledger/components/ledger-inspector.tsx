import Link from "next/link";
import {
  Archive,
  ExternalLink,
  Lock,
  Pencil,
  RotateCcw,
  Upload,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";

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
      <aside className="bg-surface p-4">
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
    <aside className="bg-surface">
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
        <h2 className="mt-4 break-words text-base font-semibold tracking-tight">
          {entry.category}
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted">
          {entry.description || "No description recorded."}
        </p>
        <div className="mt-4">
          <MoneyDisplay
            value={formatMoneyDisplay(
              entry.direction === "expense" ? -entry.amount : entry.amount,
              entry.currency,
            )}
            size="large"
          />
        </div>
      </div>

      <div className="space-y-4 p-4 text-sm sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <CompactFact label="Date">{formatDate(entry.transactionDate)}</CompactFact>
          <CompactFact label="Source">{entry.sourceLabel}</CompactFact>
          <CompactFact label="Property">
            <Link
              className="line-clamp-2 break-words text-accent hover:underline"
              href={entry.hrefs.property}
            >
              {entry.unitNumber
                ? `${entry.propertyCode} / Unit ${entry.unitNumber}`
                : entry.propertyCode}
            </Link>
          </CompactFact>
          <CompactFact label="Scope">
            {entry.unitNumber ? `Unit ${entry.unitNumber}` : "Property level"}
          </CompactFact>
          <CompactFact label="Accounting">
            <span
              className={
                entry.accountingJournalEntryId ? "text-success" : "text-danger"
              }
              title={entry.accountingJournalEntryId}
            >
              {entry.accountingJournalEntryId
                ? "Balanced journal linked"
                : "Accounting journal missing"}
            </span>
          </CompactFact>
        </div>

        <AttentionNote
          href={entry.nextAction.href}
          item={getAttentionItem(entry.riskIndicators)}
          label={entry.nextAction.label}
        />

        <div className="grid gap-2 sm:grid-cols-3">
          {isArchived ? (
            <Button
              className="sm:col-span-3"
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
                aria-label="Attach receipt"
                className="px-2"
                disabled={entry.isLocked}
                onClick={() => onAttachReceipt(entry)}
                title={
                  entry.isLocked
                    ? "This accounting period is locked."
                    : "Attach receipt"
                }
              >
                <Upload size={15} />
                Attach
              </Button>
              <Button
                aria-label="Edit ledger entry"
                className="px-2"
                disabled={entry.isLocked}
                onClick={() => onEditEntry(entry)}
                title={
                  entry.isLocked ? "This accounting period is locked." : "Edit"
                }
              >
                <Pencil size={15} />
                Edit
              </Button>
              <Button
                aria-label="Archive ledger entry"
                className="px-2"
                disabled={entry.isLocked}
                onClick={() => onArchiveEntry(entry)}
                title={
                  entry.isLocked ? "This accounting period is locked." : "Archive"
                }
              >
                <Archive size={15} />
                Archive
              </Button>
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

function DirectionBadge({ direction }: { direction: LedgerEntry["direction"] }) {
  if (direction === "income") {
    return <Badge tone="success">Income</Badge>;
  }

  return <Badge tone="warning">Expense</Badge>;
}

function AttentionNote({
  href,
  item,
  label,
}: {
  href: string;
  item?: LedgerEntry["riskIndicators"][number];
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
          {item ? null : (
            <Link
              aria-label="Open action"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
              href={href}
              title="Open action"
            >
              <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function getAttentionItem(items: LedgerEntry["riskIndicators"]) {
  return items.find((item) => item.tone !== "success");
}
