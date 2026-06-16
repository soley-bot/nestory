import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import type { LedgerEntry } from "@/features/ledger/ledger.types";

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="w-32 px-4 py-3 font-semibold">Date</th>
            <th className="w-32 px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Category</th>
            <th className="w-44 px-4 py-3 font-semibold">Property</th>
            <th className="w-36 px-4 py-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr className="border-t border-border">
              <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                No ledger entries match the current filters.
              </td>
            </tr>
          ) : null}
          {entries.map((entry) => (
            <tr className="border-t border-border" key={entry.id}>
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatDate(entry.transactionDate)}
              </td>
              <td className="px-4 py-3">
                <DirectionBadge direction={entry.direction} />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{entry.category}</p>
                <p className="mt-1 line-clamp-1 text-muted">
                  {entry.description}
                </p>
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
