import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Eye } from "lucide-react";
import {
  previewRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <div className="overflow-hidden bg-card">
      <div aria-label="Ledger table" className="overflow-x-auto" role="region">
        <table className="w-full min-w-[940px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[35%]" />
            <col className="w-[30%]" />
            <col className="w-[17%]" />
            <col className="w-[74px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs uppercase tracking-[0] text-muted-foreground shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-4 py-2.5 font-semibold">Entry</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-3 py-2.5 text-right font-semibold">Preview</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr className="border-t border-border">
                <td
                  className="px-4 py-8 text-center text-muted-foreground"
                  colSpan={5}
                >
                  No ledger rows match the current filters.
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => (
              <tr
                className={cn(
                  previewRowClassName,
                  selectedEntryId === entry.id && selectedPreviewRowClassName,
                  entry.archivedAt && "text-muted-foreground",
                )}
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEntry(entry.id);
                  }
                }}
                tabIndex={0}
                aria-selected={selectedEntryId === entry.id}
              >
                <td className="whitespace-nowrap px-3 py-2.5 align-middle text-muted-foreground">
                  {formatDate(entry.transactionDate)}
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    <DirectionBadge direction={entry.direction} />
                    <p className="truncate font-medium text-foreground">
                      {entry.category}
                    </p>
                  </div>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <p
                    className="truncate font-medium"
                    title={entry.propertyCode}
                  >
                    {entry.propertyCode}
                  </p>
                  <Link
                    className="mt-0.5 block truncate text-xs text-accent hover:underline"
                    href={`/properties/${entry.propertyId}/account`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {entry.propertyName}
                  </Link>
                </td>
                <td
                  className="px-3 py-2.5 align-middle tabular-nums"
                  data-money-cell="true"
                >
                  <MoneyDisplay
                    align="right"
                    className={
                      entry.direction === "expense"
                        ? "text-danger"
                        : "text-success"
                    }
                    value={formatMoneyDisplay(
                      entry.direction === "expense"
                        ? -entry.amount
                        : entry.amount,
                      entry.currency,
                    )}
                  />
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  <Button
                    aria-label={`Preview ${entry.category}`}
                    aria-pressed={selectedEntryId === entry.id}
                    className="h-8 w-8 px-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEntry(entry.id);
                    }}
                    title={`Preview ${entry.category}`}
                    variant="ghost"
                  >
                    <Eye size={15} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DirectionBadge({
  direction,
}: {
  direction: LedgerEntry["direction"];
}) {
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
