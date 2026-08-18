import Link from "next/link";
import type { ReactNode } from "react";
import { PanelRightOpen } from "lucide-react";
import { RecordLink } from "@/components/data/interactive-table";
import { Badge } from "@/components/ui/badge";
import type { LeaseArchiveState, LeaseSummary } from "@/features/leases/lease.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type LeasesTableProps = {
  archiveState: LeaseArchiveState;
  getLeaseHref: (id: string) => string;
  leases: LeaseSummary[];
  onSelectLease: (id: string) => void;
  selectedLeaseId: string;
};

export function LeasesTable({
  archiveState,
  getLeaseHref,
  leases,
  onSelectLease,
  selectedLeaseId,
}: LeasesTableProps) {
  return (
    <div className="min-w-0">
      <div className="space-y-3 md:hidden">
        {leases.length === 0 ? (
          <p className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {getEmptyMessage(archiveState)}
          </p>
        ) : null}
        {leases.map((lease) => (
          <LeaseCard
            getLeaseHref={getLeaseHref}
            key={lease.id}
            lease={lease}
            onSelectLease={onSelectLease}
            selected={selectedLeaseId === lease.id}
          />
        ))}
      </div>

      <div
        className="hidden min-w-0 md:block"
        data-slot="register-table-frame"
      >
        <div aria-label="Leases table" className="overflow-x-auto" role="region">
          <table className="w-full min-w-[860px] table-auto border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs uppercase tracking-[0] text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-2.5 py-2.5 font-semibold">Tenant</th>
                <th className="px-1.5 py-2.5 font-semibold">Property / Unit</th>
                <th className="px-1.5 py-2.5 font-semibold">Term</th>
                <th className="px-1.5 py-2.5 text-right font-semibold">Rent</th>
                <th className="px-1.5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {leases.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    {getEmptyMessage(archiveState)}
                  </td>
                </tr>
              ) : null}
              {leases.map((lease) => {
                const partySummary = getSecondaryParty(lease);
                const depositAttention = getDepositAttention(lease);

                return (
                <tr
                  aria-selected={selectedLeaseId === lease.id}
                  className={cn(
                    "cursor-pointer border-t border-border outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selectedLeaseId === lease.id &&
                      "bg-accent shadow-[inset_3px_0_0_var(--record-spine)]",
                    lease.isArchived && "text-muted-foreground",
                  )}
                  key={lease.id}
                  onClick={() => onSelectLease(lease.id)}
                  onKeyDown={(event) => {
                    if (event.currentTarget !== event.target) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectLease(lease.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="max-w-[15rem] px-2.5 py-2 align-middle">
                    <RecordLink
                      href={getLeaseHref(lease.id)}
                      title={`Open lease for ${lease.tenantName}`}
                    >
                      {lease.tenantName}
                    </RecordLink>
                    {partySummary ? (
                      <p
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        title={partySummary}
                      >
                        {partySummary}
                      </p>
                    ) : null}
                  </td>
                  <td className="max-w-[18rem] px-1.5 py-2 align-middle">
                    <RecordContextLinks lease={lease} />
                  </td>
                  <td className="w-px whitespace-nowrap px-1.5 py-2 align-middle tabular-nums">
                    <p className="truncate">
                      {lease.startDateLabel} &ndash; {lease.endDateLabel}
                    </p>
                  </td>
                  <td className="w-px whitespace-nowrap px-1.5 py-2 text-right align-middle">
                    <TableMoneyDisplay value={lease.rentDisplay} />
                  </td>
                  <td className="px-1.5 py-2 align-middle">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge className="px-2 text-xs" tone={lease.statusTone}>
                          {lease.statusLabel}
                        </Badge>
                        {lease.isArchived ? (
                          <Badge className="px-2 text-xs" tone="warning">Archived</Badge>
                        ) : null}
                      </div>
                      {depositAttention ? (
                        <p
                          className="min-w-0 truncate text-xs text-warning"
                          title={depositAttention}
                        >
                          {depositAttention}
                        </p>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RecordContextLinks({ lease }: { lease: LeaseSummary }) {
  return (
    <div className="min-w-0">
      <span className="block truncate font-medium" title={lease.unitLabel}>
        {lease.unitLabel}
      </span>
      <Link
        className="mt-0.5 block truncate rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        href={`/properties/${lease.propertyId}`}
        onClick={(event) => event.stopPropagation()}
        prefetch={false}
        title={lease.propertyName}
      >
        {lease.propertyName}
      </Link>
    </div>
  );
}

function LeaseCard({
  getLeaseHref,
  lease,
  onSelectLease,
  selected,
}: {
  getLeaseHref: (id: string) => string;
  lease: LeaseSummary;
  onSelectLease: (id: string) => void;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        "min-w-0 rounded-md border border-border bg-card p-3 text-sm transition-colors hover:border-record-spine",
        selected && "border-record-spine bg-accent",
        lease.isArchived && "text-muted-foreground",
      )}
      data-selected={selected ? "true" : "false"}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <RecordLink
            className="text-sm font-semibold leading-5"
            href={getLeaseHref(lease.id)}
            title={`Open lease for ${lease.tenantName}`}
          >
            {lease.tenantName}
          </RecordLink>
          <p className="mt-1 truncate text-xs font-medium" title={lease.unitLabel}>
            {lease.unitLabel}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{lease.propertyName}</p>
        </div>
        <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <LeaseCardDetail label="Start" value={lease.startDateLabel} />
        <LeaseCardDetail align="right" label="End" value={lease.endDateLabel} />
        <LeaseCardDetail label="Payment" value={formatLedgerCount(lease)} />
        {getDepositAttention(lease) ? (
          <LeaseCardDetail
            align="right"
            label="Deposit"
            value={getDepositAttention(lease)}
          />
        ) : null}
      </dl>

      <button
        aria-label={`Preview lease for ${lease.tenantName}`}
        aria-pressed={selected}
        className={cn(
          "mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          selected && "border-record-spine bg-accent",
        )}
        onClick={() => onSelectLease(lease.id)}
        type="button"
      >
        <PanelRightOpen aria-hidden="true" className="size-3.5" />
        Preview
      </button>
    </article>
  );
}

function LeaseCardDetail({
  align = "left",
  children,
  label,
  value,
}: {
  align?: "left" | "right";
  children?: ReactNode;
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0"}>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}

function TableMoneyDisplay({ value }: { value: MoneyDisplayValue }) {
  const primary = formatMoneyWithSymbol(value.primary);

  return (
    <span className="flex min-w-0 flex-col items-end gap-0.5 text-right tabular-nums" title={primary}>
      <span className="max-w-full truncate font-semibold leading-5 text-foreground">{primary}</span>
    </span>
  );
}

/**
 * partySummary is usually just the tenant name again. Show it only when it
 * says something the primary line does not.
 */
function getSecondaryParty(lease: LeaseSummary) {
  const summary = lease.partySummary?.trim();

  if (!summary) {
    return null;
  }

  const words = (value: string) =>
    value.toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");

  return words(summary) === words(lease.tenantName) ? null : summary;
}

function formatLedgerCount(lease: LeaseSummary) {
  const count = lease.recordCounts.ledgerEntries;
  return `${count} ledger ${count === 1 ? "entry" : "entries"}`;
}

function getDepositAttention(lease: LeaseSummary) {
  const deposit = lease.deposits[0];

  if (!lease.depositDisplay) {
    return null;
  }

  if (!deposit) {
    return "Deposit not received";
  }

  const status = deposit.statusLabel.toLowerCase();

  if (status === "active" || status === "held" || status === "returned") {
    return null;
  }

  return `${deposit.statusLabel} deposit`;
}

function getEmptyMessage(archiveState: LeaseArchiveState) {
  if (archiveState === "archived") {
    return "No archived leases.";
  }

  if (archiveState === "all") {
    return "No leases yet.";
  }

  return "No active leases yet.";
}

function formatMoneyWithSymbol(label: string) {
  const isNegative = label.startsWith("-");
  const unsignedLabel = isNegative ? label.slice(1) : label;
  const codePrefix = "USD ";
  const amount = unsignedLabel.startsWith(codePrefix)
    ? unsignedLabel.slice(codePrefix.length)
    : unsignedLabel;

  return `${isNegative ? "-" : ""}$${amount}`;
}
