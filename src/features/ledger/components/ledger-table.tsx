import {
  Archive,
  ArrowDownCircle,
  ArrowUpCircle,
  ExternalLink,
  Lock,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoneyDisplay,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { cn } from "@/lib/utils";

type LedgerTableProps = {
  currencySettings: CurrencyDisplaySettings;
  entries: LedgerEntry[];
  onArchiveEntry: (entry: LedgerEntry) => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onRestoreEntry: (entry: LedgerEntry) => void;
  onSelectEntry: (id: string) => void;
  selectedEntryId: string;
};

export function LedgerTable({
  currencySettings,
  entries,
  onArchiveEntry,
  onEditEntry,
  onRestoreEntry,
  onSelectEntry,
  selectedEntryId,
}: LedgerTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[min(680px,calc(100vh-260px))] overflow-auto">
        <table className="w-full min-w-[740px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[104px]" />
            <col className="w-[96px]" />
            <col />
            <col className="w-[136px]" />
            <col className="w-[120px]" />
            <col className="w-[84px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-3 font-semibold">Date</th>
              <th className="px-3 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-3 py-3 font-semibold">Property</th>
              <th className="px-3 py-3 text-right font-semibold">Amount</th>
              <th className="px-2 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                  No ledger rows match the current filters.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  selectedEntryId === entry.id && "bg-accent-soft",
                  entry.archivedAt && "text-muted",
                )}
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEntry(entry.id);
                  }
                }}
                tabIndex={0}
              >
              <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                {formatDate(entry.transactionDate)}
              </td>
              <td className="px-3 py-2.5">
                <DirectionBadge direction={entry.direction} />
              </td>
              <td className="px-4 py-2.5">
                <p className="break-words font-medium text-foreground">
                  {entry.category}
                </p>
                <p className="mt-1 line-clamp-1 text-muted">
                  {entry.description || "No description recorded."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <ExternalLink size={13} />
                  {entry.relatedTimelineEvent
                    ? "Timeline linked"
                    : "Timeline link pending"}
                  {entry.archivedAt ? (
                    <>
                      <span aria-hidden="true">-</span>
                      <span>Archived</span>
                    </>
                  ) : null}
                  {entry.isLocked ? (
                    <>
                      <span aria-hidden="true">-</span>
                      <Lock size={12} />
                      <span>Locked</span>
                    </>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2.5">
                <p className="truncate font-medium" title={entry.propertyCode}>
                  {entry.propertyCode}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {entry.unitNumber ? `Unit ${entry.unitNumber}` : "Property"}
                </p>
              </td>
              <td className="px-3 py-2.5">
                <MoneyDisplay
                  align="right"
                  value={formatMoneyDisplay(
                    entry.direction === "expense" ? -entry.amount : entry.amount,
                    entry.currency,
                    currencySettings,
                  )}
                />
              </td>
              <td className="px-2 py-2.5">
                <div className="flex justify-end gap-1">
                  {entry.archivedAt ? (
                    <button
                      aria-label={`Restore ${entry.category}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-accent disabled:pointer-events-none disabled:opacity-50"
                      disabled={entry.isLocked}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRestoreEntry(entry);
                      }}
                      title={
                        entry.isLocked
                          ? "This accounting period is locked."
                          : undefined
                      }
                      type="button"
                    >
                      <RotateCcw size={15} />
                    </button>
                  ) : (
                    <>
                      <button
                        aria-label={`Edit ${entry.category}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                        disabled={entry.isLocked}
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditEntry(entry);
                        }}
                        title={
                          entry.isLocked ? "This accounting period is locked." : undefined
                        }
                        type="button"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        aria-label={`Archive ${entry.category}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-danger disabled:pointer-events-none disabled:opacity-50"
                        disabled={entry.isLocked}
                        onClick={(event) => {
                          event.stopPropagation();
                          onArchiveEntry(entry);
                        }}
                        title={
                          entry.isLocked ? "This accounting period is locked." : undefined
                        }
                        type="button"
                      >
                        <Archive size={15} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: LedgerEntry["direction"] }) {
  if (direction === "income") {
    return (
      <Badge tone="success">
        <ArrowUpCircle size={13} />
        Income
      </Badge>
    );
  }

  return (
    <Badge tone="warning">
      <ArrowDownCircle size={13} />
      Expense
    </Badge>
  );
}
