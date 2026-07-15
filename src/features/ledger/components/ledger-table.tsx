import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Eye, Lock } from "lucide-react";
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
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[330px] overflow-auto md:max-h-[min(620px,calc(100vh-320px))]">
        <table className="w-full min-w-[940px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[34%]" />
            <col className="w-[27%]" />
            <col className="w-[18%]" />
            <col className="w-[74px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Flow</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-3 py-2.5 text-right font-semibold">Preview</th>
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
                aria-selected={selectedEntryId === entry.id}
              >
                <td className="whitespace-nowrap px-3 py-2.5 align-middle text-muted">
                  {formatDate(entry.transactionDate)}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    <DirectionBadge direction={entry.direction} />
                    <p className="truncate text-xs text-muted">
                    {entry.sourceLabel}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-medium text-foreground">
                      {entry.category}
                    </p>
                    <LedgerInlineBadges entry={entry} />
                  </div>
                  <p
                    className="mt-0.5 truncate text-xs text-muted"
                    title={entry.description || entry.nextAction.description}
                  >
                    {entry.description || entry.nextAction.label}
                  </p>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <p className="truncate font-medium" title={entry.propertyCode}>
                    {entry.propertyCode}
                  </p>
                  <Link
                    className="mt-0.5 block truncate text-xs text-accent hover:underline"
                    href={entry.hrefs.property}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {entry.propertyName}
                  </Link>
                  {entry.unitNumber ? (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      Unit {entry.unitNumber}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-middle tabular-nums" data-money-cell="true">
                  <MoneyDisplay
                    align="right"
                    className={
                      entry.direction === "expense" ? "text-danger" : "text-success"
                    }
                    value={formatMoneyDisplay(
                      entry.direction === "expense" ? -entry.amount : entry.amount,
                      entry.currency,
                    )}
                  />
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  <Button
                    aria-label={`Preview ${entry.category}`}
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

function LedgerInlineBadges({ entry }: { entry: LedgerEntry }) {
  if (!entry.archivedAt && !entry.isLocked && !entry.riskIndicators[0]) {
    return null;
  }

  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5">
      {entry.riskIndicators[0] ? (
        <Badge className="px-2 text-xs" tone={entry.riskIndicators[0].tone}>
          {entry.riskIndicators[0].label}
        </Badge>
      ) : null}
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
    </span>
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
