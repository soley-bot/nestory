import Link from "next/link";
import {
  Archive,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Lock,
  Pencil,
  RotateCcw,
  Upload,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/features/documents/components/document-list";
import type { LedgerEntry } from "@/features/ledger/ledger.types";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoneyDisplay,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";

type LedgerInspectorProps = {
  currencySettings: CurrencyDisplaySettings;
  entry: LedgerEntry | null;
  onArchiveEntry: (entry: LedgerEntry) => void;
  onAttachReceipt: (entry: LedgerEntry) => void;
  onEditEntry: (entry: LedgerEntry) => void;
  onRestoreEntry: (entry: LedgerEntry) => void;
};

export function LedgerInspector({
  currencySettings,
  entry,
  onArchiveEntry,
  onAttachReceipt,
  onEditEntry,
  onRestoreEntry,
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

  const isArchived = Boolean(entry.archivedAt);

  return (
    <aside className="rounded-md border border-border bg-surface">
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
              currencySettings,
            )}
            size="large"
          />
        </div>
      </div>

      <div className="space-y-5 p-4 text-sm sm:p-5">
        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                Next action
              </p>
              <p className="mt-1 font-semibold">{entry.nextAction.label}</p>
            </div>
            <Badge tone={entry.nextAction.tone}>
              {getRiskBadgeLabel(entry.nextAction.tone)}
            </Badge>
          </div>
          <p className="mt-2 leading-6 text-muted">
            {entry.nextAction.description}
          </p>
          <Link
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
            href={entry.nextAction.href}
          >
            Open action
            <ExternalLink size={13} />
          </Link>
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Risk
          </p>
          <div className="mt-2 space-y-2">
            {entry.riskIndicators.map((risk) => (
              <RiskRow key={risk.id} risk={risk} />
            ))}
          </div>
        </section>

        <InspectorRow icon={<CalendarDays size={16} />} label="Transaction date">
          {formatDate(entry.transactionDate)}
        </InspectorRow>
        <InspectorRow icon={<Landmark size={16} />} label="Property">
          <Link
            className="font-medium text-accent hover:underline"
            href={entry.hrefs.property}
          >
            {entry.propertyName}
          </Link>
          {entry.unitNumber ? (
            <Link
              className="block text-muted hover:text-accent hover:underline"
              href={entry.hrefs.unit ?? entry.hrefs.property}
            >
              Unit {entry.unitNumber}
            </Link>
          ) : (
            <span className="block text-muted">Property level</span>
          )}
        </InspectorRow>
        <InspectorRow icon={<ExternalLink size={16} />} label="Timeline sync">
          {entry.relatedTimelineEvent
            ? "Linked and kept in sync"
            : "Timeline link pending"}
        </InspectorRow>
        {entry.archivedAt ? (
          <InspectorRow icon={<Archive size={16} />} label="Archived">
            {formatDate(entry.archivedAt)}
          </InspectorRow>
        ) : null}
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Linked timeline
        </p>
        <div className="mt-3 rounded-md border border-border px-3 py-2 text-sm">
          {entry.relatedTimelineEvent ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {entry.relatedTimelineEvent.title}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Edits and archives from Ledger keep this timeline event in sync.
                </p>
              </div>
              <Link
                className="inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                href={entry.hrefs.timeline}
              >
                <ExternalLink size={14} />
                Open timeline event
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

      <div className="border-t border-border p-4 sm:p-5">
        <div className="mb-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Receipts
            </p>
            {!isArchived ? (
              <Button onClick={() => onAttachReceipt(entry)} variant="ghost">
                <Upload size={15} />
                Attach
              </Button>
            ) : null}
          </div>
          <DocumentList
            documents={entry.documents}
            emptyLabel="No receipts attached yet."
          />
        </div>
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            History
          </p>
          <Badge>{entry.recordCounts.activity}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {entry.activity.length === 0 ? (
            <MiniRow label="Activity" value="No entry activity logged yet." />
          ) : (
            entry.activity.slice(0, 4).map((change) => (
              <Link
                className="block rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-surface-muted"
                href={change.href}
                key={change.id}
              >
                <MiniRow
                  label={`${change.actionLabel} / ${change.entityLabel}`}
                  value={`${change.recordLabel} / ${formatDate(change.createdAt)}`}
                />
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {isArchived ? (
            <Button
              className="col-span-2"
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
                disabled={entry.isLocked}
                onClick={() => onEditEntry(entry)}
                title={
                  entry.isLocked ? "This accounting period is locked." : undefined
                }
              >
                <Pencil size={15} />
                Edit
              </Button>
              <Button
                disabled={entry.isLocked}
                onClick={() => onArchiveEntry(entry)}
                title={
                  entry.isLocked ? "This accounting period is locked." : undefined
                }
              >
                <Archive size={15} />
                Archive
              </Button>
            </>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          {entry.isLocked
            ? "This entry belongs to a locked accounting period. Unlock the period before editing, archiving, or restoring it."
            : "Archiving from Ledger hides this entry from totals and archives the linked timeline event when one exists."}
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

function RiskRow({
  risk,
}: {
  risk: LedgerEntry["riskIndicators"][number];
}) {
  const Icon =
    risk.tone === "success"
      ? CheckCircle2
      : risk.tone === "danger" || risk.tone === "warning"
        ? AlertTriangle
        : CalendarDays;

  return (
    <div className="flex min-w-0 gap-2 rounded-md border border-border px-2.5 py-2">
      <Icon className="mt-0.5 shrink-0 text-muted" size={14} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{risk.label}</p>
          <Badge className="px-2 text-xs" tone={risk.tone}>
            {getRiskBadgeLabel(risk.tone)}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          {risk.description}
        </p>
      </div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="truncate font-medium" title={label}>
        {label}
      </p>
      <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted">
        {value}
      </p>
    </div>
  );
}

function getRiskBadgeLabel(tone: LedgerEntry["riskIndicators"][number]["tone"]) {
  if (tone === "success") {
    return "Ready";
  }

  if (tone === "danger") {
    return "Risk";
  }

  return "Review";
}
