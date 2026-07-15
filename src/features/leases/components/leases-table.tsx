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
    <div className="h-full min-h-0">
      <div className="h-full min-h-[380px] space-y-3 overflow-auto pr-1 md:hidden">
        {leases.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
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

      <div className="hidden h-full overflow-hidden rounded-md border border-border bg-surface md:block">
        <div className="h-full min-h-[540px] overflow-auto">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[13px]">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[19%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-2.5 py-2.5 font-semibold">Tenant</th>
                <th className="px-1.5 py-2.5 font-semibold">Property / Unit</th>
                <th className="px-1.5 py-2.5 font-semibold">Start / End</th>
                <th className="px-1.5 py-2.5 text-right font-semibold">Rent</th>
                <th className="px-1.5 py-2.5 font-semibold">Payment / Deposit</th>
                <th className="px-1.5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {leases.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                    {getEmptyMessage(archiveState)}
                  </td>
                </tr>
              ) : null}
              {leases.map((lease) => (
                <tr
                  aria-selected={selectedLeaseId === lease.id}
                  className={cn(
                    "cursor-pointer border-t border-border outline-none transition-colors hover:bg-surface-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
                    selectedLeaseId === lease.id &&
                      "bg-state-selected shadow-[inset_3px_0_0_var(--record-spine)]",
                    lease.isArchived && "text-muted",
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
                  <td className="px-2.5 py-2 align-middle">
                    <RecordLink
                      href={getLeaseHref(lease.id)}
                      title={`Open lease for ${lease.tenantName}`}
                    >
                      {lease.tenantName}
                    </RecordLink>
                    <p className="mt-0.5 truncate text-xs text-muted" title={lease.partySummary}>
                      {lease.partySummary}
                    </p>
                  </td>
                  <td className="px-1.5 py-2 align-middle">
                    <RecordContextLinks lease={lease} />
                  </td>
                  <td className="px-1.5 py-2 align-middle tabular-nums">
                    <p className="truncate font-medium">{lease.startDateLabel}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{lease.endDateLabel}</p>
                  </td>
                  <td className="px-1.5 py-2 text-right align-middle">
                    <TableMoneyDisplay value={lease.rentDisplay} />
                  </td>
                  <td className="px-1.5 py-2 align-middle">
                    <p className="truncate font-medium">{formatLedgerCount(lease)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{getDepositStatus(lease)}</p>
                  </td>
                  <td className="px-1.5 py-2 align-middle">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <Badge className="px-2 text-xs" tone={lease.statusTone}>
                        {lease.statusLabel}
                      </Badge>
                      {lease.isArchived ? (
                        <Badge className="px-2 text-xs" tone="warning">Archived</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted" title={lease.nextAction.description}>
                      {lease.nextAction.label}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RecordContextLinks({ lease }: { lease: LeaseSummary }) {
  const linkClassName =
    "block truncate rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

  return (
    <div className="min-w-0">
      {lease.unitId ? (
        <Link
          className={linkClassName}
          href={`/units/${lease.unitId}`}
          onClick={(event) => event.stopPropagation()}
          prefetch={false}
          title={lease.unitLabel}
        >
          {lease.unitLabel}
        </Link>
      ) : (
        <span className="block truncate font-medium">{lease.unitLabel}</span>
      )}
      <Link
        className="mt-0.5 block truncate rounded-sm text-xs text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
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
        "min-w-0 rounded-md border border-border bg-surface p-3 text-sm transition-colors hover:border-record-spine",
        selected && "border-record-spine bg-state-selected",
        lease.isArchived && "text-muted",
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
          <p className="mt-0.5 truncate text-xs text-muted">{lease.propertyName}</p>
        </div>
        <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <LeaseCardDetail label="Start" value={lease.startDateLabel} />
        <LeaseCardDetail align="right" label="End" value={lease.endDateLabel} />
        <LeaseCardDetail label="Payment" value={formatLedgerCount(lease)} />
        <LeaseCardDetail align="right" label="Deposit" value={getDepositStatus(lease)} />
      </dl>

      <button
        aria-label={`Preview lease for ${lease.tenantName}`}
        aria-pressed={selected}
        className={cn(
          "mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
          selected && "border-record-spine bg-state-selected",
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
      <dt className="text-[11px] font-medium uppercase text-muted">{label}</dt>
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

function formatLedgerCount(lease: LeaseSummary) {
  const count = lease.recordCounts.ledgerEntries;
  return `${count} ledger ${count === 1 ? "entry" : "entries"}`;
}

function getDepositStatus(lease: LeaseSummary) {
  const deposit = lease.deposits[0];

  if (deposit) {
    return `${deposit.statusLabel} deposit`;
  }

  return lease.depositDisplay ? "Deposit recorded" : "No deposit";
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
