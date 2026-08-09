import Link from "next/link";
import { ExternalLink, Lock, Upload } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";

type LedgerInspectorProps = {
  canManageFinance?: boolean;
  entry: LedgerEntry | null;
  onAttachReceipt: (entry: LedgerEntry) => void;
};

export function LedgerInspector({
  canManageFinance = true,
  entry,
  onAttachReceipt,
}: LedgerInspectorProps) {
  if (!entry) {
    return (
      <aside className="bg-card p-4">
        <h2 className="text-base font-semibold tracking-tight">Ledger entry</h2>
      </aside>
    );
  }

  const isArchived = Boolean(entry.archivedAt);

  return (
    <aside className="bg-card">
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
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
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
          <CompactFact label="Record integrity">
            <span
              className={entry.sourceResolved ? "text-success" : "text-danger"}
            >
              {entry.sourceResolved ? "Source linked" : "Needs review"}
            </span>
          </CompactFact>
          {entry.reversalOfLedgerEntryId ? (
            <CompactFact label="Reversal">Linked to original</CompactFact>
          ) : null}
        </div>

        <AttentionNote
          href={entry.nextAction.href}
          item={getAttentionItem(entry.riskIndicators)}
          label={entry.nextAction.label}
        />

        {canManageFinance && !isArchived ? (
          <Button
            aria-label="Attach receipt"
            className="w-full"
            disabled={entry.isLocked}
            onClick={() => onAttachReceipt(entry)}
            title={entry.isLocked ? "This month is locked." : "Attach receipt"}
          >
            <Upload size={15} />
            Attach
          </Button>
        ) : null}
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
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
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
    <div className="rounded-md border border-border bg-muted/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-semibold">{item?.label ?? label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? "Review" : "Action"}
          </Badge>
          {item ? null : (
            <Link
              aria-label="Open action"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-accent transition-colors hover:bg-muted"
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
