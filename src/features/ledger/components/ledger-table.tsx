import {
  Archive,
  ArrowDownCircle,
  ArrowUpCircle,
  ExternalLink,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { cn } from "@/lib/utils";

type LedgerTableProps = {
  entries: LedgerEntry[];
  onArchiveEntry: (entry: LedgerEntry) => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onSelectEntry: (id: string) => void;
  selectedEntryId: string;
};

export function LedgerTable({
  entries,
  onArchiveEntry,
  onEditEntry,
  onSelectEntry,
  selectedEntryId,
}: LedgerTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="min-w-[840px] w-full border-collapse text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="w-32 px-4 py-3 font-semibold">Date</th>
            <th className="w-32 px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Category</th>
            <th className="w-44 px-4 py-3 font-semibold">Property</th>
            <th className="w-36 px-4 py-3 text-right font-semibold">Amount</th>
            <th className="w-28 px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr className="border-t border-border">
              <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                No ledger entries match the current filters.
              </td>
            </tr>
          ) : null}
          {entries.map((entry) => (
            <tr
              className={cn(
                "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70",
                selectedEntryId === entry.id && "bg-accent-soft",
              )}
              key={entry.id}
              onClick={() => onSelectEntry(entry.id)}
            >
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatDate(entry.transactionDate)}
              </td>
              <td className="px-4 py-3">
                <DirectionBadge direction={entry.direction} />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{entry.category}</p>
                <p className="mt-1 line-clamp-1 text-muted">
                  {entry.description || "No description recorded."}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted">
                  <ExternalLink size={13} />
                  {entry.relatedTimelineEvent
                    ? "Timeline linked"
                    : "Timeline link pending"}
                </div>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{entry.propertyCode}</p>
                <p className="mt-1 text-xs text-muted">
                  {entry.unitNumber ? `Unit ${entry.unitNumber}` : "Property"}
                </p>
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {entry.direction === "expense" ? "-" : ""}
                {formatMoney(entry.amount, entry.currency)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <button
                    aria-label={`Edit ${entry.category}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditEntry(entry);
                    }}
                    type="button"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`Archive ${entry.category}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchiveEntry(entry);
                    }}
                    type="button"
                  >
                    <Archive size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
