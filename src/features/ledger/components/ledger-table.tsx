import {
  Archive,
  ArrowDownCircle,
  ArrowUpCircle,
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
      <div className="max-h-[330px] overflow-auto md:max-h-[min(620px,calc(100vh-320px))]">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[100px]" />
            <col className="w-[104px]" />
            <col />
            <col className="w-[132px]" />
            <col className="w-[132px]" />
            <col className="w-[72px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-1.5 py-2.5 text-center font-semibold">Actions</th>
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
                  selectedEntryId === entry.id && "bg-surface-muted",
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
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {formatDate(entry.transactionDate)}
                </td>
                <td className="px-3 py-2">
                  <DirectionBadge direction={entry.direction} />
                </td>
                <td className="px-4 py-2">
                  <p className="line-clamp-1 break-words font-medium text-foreground">
                    {entry.category}
                  </p>
                  <p className="mt-1 line-clamp-1 text-muted">
                    {entry.description || "No description recorded."}
                  </p>
                  {entry.archivedAt || entry.isLocked ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {entry.archivedAt ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          Archived
                        </Badge>
                      ) : null}
                      {entry.isLocked ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          <Lock size={12} />
                          Locked
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <p className="truncate font-medium" title={entry.propertyCode}>
                    {entry.propertyCode}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {entry.unitNumber ? `Unit ${entry.unitNumber}` : "Property"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <MoneyDisplay
                    align="right"
                    value={formatMoneyDisplay(
                      entry.direction === "expense" ? -entry.amount : entry.amount,
                      entry.currency,
                      currencySettings,
                    )}
                  />
                </td>
                <td className="px-1.5 py-2">
                  <div className="flex justify-center gap-0.5">
                  {entry.archivedAt ? (
                    <button
                      aria-label={`Restore ${entry.category}`}
                      className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-accent disabled:pointer-events-none disabled:opacity-50"
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
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        aria-label={`Edit ${entry.category}`}
                        className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
                        <Pencil size={14} />
                      </button>
                      <button
                        aria-label={`Archive ${entry.category}`}
                        className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-danger disabled:pointer-events-none disabled:opacity-50"
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
                        <Archive size={14} />
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
