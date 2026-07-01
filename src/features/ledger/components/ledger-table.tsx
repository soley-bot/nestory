import { ArrowDownCircle, ArrowUpCircle, Lock } from "lucide-react";
import {
  previewRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { cn } from "@/lib/utils";

type LedgerTableProps = {
  entries: LedgerEntry[];
  onSelectEntry: (id: string) => void;
  selectedEntryId: string;
};

export function LedgerTable({
  entries,
  onSelectEntry,
  selectedEntryId,
}: LedgerTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[330px] overflow-auto md:max-h-[min(620px,calc(100vh-320px))]">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[108px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[156px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                  No ledger rows match the current filters.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr
                className={cn(
                  previewRowClassName,
                  selectedEntryId === entry.id && selectedPreviewRowClassName,
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
                  <p className="truncate font-medium text-foreground">
                    {entry.category}
                  </p>
                  {entry.archivedAt || entry.isLocked ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
                  {entry.unitNumber ? (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      Unit {entry.unitNumber}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <MoneyDisplay
                    align="right"
                    value={formatMoneyDisplay(
                      entry.direction === "expense" ? -entry.amount : entry.amount,
                      entry.currency,
                    )}
                  />
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
