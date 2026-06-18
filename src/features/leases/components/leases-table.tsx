import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LeaseArchiveState, LeaseSummary } from "@/features/leases/lease.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type LeasesTableProps = {
  archiveState: LeaseArchiveState;
  leases: LeaseSummary[];
  onArchiveLease: (lease: LeaseSummary) => void;
  onEditLease: (lease: LeaseSummary) => void;
  onRestoreLease: (lease: LeaseSummary) => void;
  onSelectLease: (id: string) => void;
  selectedLeaseId: string;
};

export function LeasesTable({
  archiveState,
  leases,
  onArchiveLease,
  onEditLease,
  onRestoreLease,
  onSelectLease,
  selectedLeaseId,
}: LeasesTableProps) {
  return (
    <div>
      <div className="space-y-3 md:hidden">
        {leases.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            {getEmptyMessage(archiveState)}
          </p>
        ) : null}
        {leases.map((lease) => (
          <LeaseCard
            key={lease.id}
            lease={lease}
            onSelectLease={onSelectLease}
            selected={selectedLeaseId === lease.id}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
        <div className="max-h-[min(680px,calc(100vh-260px))] overflow-auto">
          <table className="w-full min-w-[940px] table-fixed border-collapse text-left text-[13px]">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[17%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-2.5 py-2.5 font-semibold">Lease</th>
                <th className="px-2 py-2.5 font-semibold">Tenant</th>
                <th className="px-2 py-2.5 font-semibold">Unit</th>
                <th className="px-2 py-2.5 font-semibold">Term</th>
                <th className="px-2 py-2.5 text-right font-semibold">Rent</th>
                <th className="px-2 py-2.5 text-right font-semibold">
                  Deposit
                </th>
                <th className="px-1.5 py-2.5 text-center font-semibold">
                  Status
                </th>
                <th className="px-1.5 py-2.5 text-center font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {leases.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-center text-muted" colSpan={8}>
                    {getEmptyMessage(archiveState)}
                  </td>
                </tr>
              ) : null}
              {leases.map((lease) => (
                <tr
                  className={cn(
                    "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    selectedLeaseId === lease.id && "bg-accent-soft",
                    lease.isArchived && "text-muted",
                  )}
                  key={lease.id}
                  onClick={() => onSelectLease(lease.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectLease(lease.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-2.5 py-2">
                    <p className="truncate font-medium" title={lease.propertyCode}>
                      {lease.propertyCode}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {lease.startDateLabel}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <p
                      className="line-clamp-2 break-words font-medium leading-[18px]"
                      title={lease.tenantName}
                    >
                      {lease.tenantName}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <p className="truncate font-medium" title={lease.unitLabel}>
                      {lease.unitLabel}
                    </p>
                    <p
                      className="mt-0.5 truncate text-xs text-muted"
                      title={lease.propertyName}
                    >
                      {lease.propertyName}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <p className="truncate font-medium">{lease.startDateLabel}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      Ends {lease.endDateLabel}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <TableMoneyDisplay value={lease.rentDisplay} />
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    {lease.depositDisplay ? (
                      <TableMoneyDisplay value={lease.depositDisplay} />
                    ) : (
                      <span className="text-xs text-muted">
                        {lease.depositLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 py-2">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Badge className="px-2 text-xs" tone={lease.statusTone}>
                        {lease.statusLabel}
                      </Badge>
                      {lease.isArchived ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-1.5 py-2">
                    <LeaseActions
                      lease={lease}
                      onArchiveLease={onArchiveLease}
                      onEditLease={onEditLease}
                      onRestoreLease={onRestoreLease}
                    />
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

function getEmptyMessage(archiveState: LeaseArchiveState) {
  if (archiveState === "archived") {
    return "No archived leases.";
  }

  if (archiveState === "all") {
    return "No leases yet.";
  }

  return "No active leases yet.";
}

function LeaseCard({
  lease,
  onSelectLease,
  selected,
}: {
  lease: LeaseSummary;
  onSelectLease: (id: string) => void;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        "min-w-0 cursor-pointer rounded-md border border-border bg-surface p-3.5 text-sm transition-colors hover:border-[#c9d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        selected && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        lease.isArchived && "text-muted",
      )}
      onClick={() => onSelectLease(lease.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectLease(lease.id);
        }
      }}
      tabIndex={0}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-base font-semibold leading-5">
            {lease.tenantName}
          </h2>
          <p className="mt-1 truncate text-sm text-muted" title={lease.unitLabel}>
            {lease.unitLabel}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {lease.propertyCode} / {lease.propertyName}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
          {lease.isArchived ? <Badge tone="warning">Archived</Badge> : null}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <LeaseCardDetail label="Term" value={lease.termLabel} />
        <LeaseCardDetail align="right" label="Rent">
          <TableMoneyDisplay value={lease.rentDisplay} />
        </LeaseCardDetail>
        <LeaseCardDetail label="Deposit" value={lease.depositLabel} />
        <LeaseCardDetail
          align="right"
          label="Occupancy"
          value={lease.occupancyLabel}
        />
      </dl>
    </article>
  );
}

function LeaseActions({
  className,
  lease,
  onArchiveLease,
  onEditLease,
  onRestoreLease,
}: {
  className?: string;
  lease: LeaseSummary;
  onArchiveLease: (lease: LeaseSummary) => void;
  onEditLease: (lease: LeaseSummary) => void;
  onRestoreLease: (lease: LeaseSummary) => void;
}) {
  const baseClassName = cn("flex justify-center gap-0.5", className);
  const buttonClassName =
    "inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50";

  if (lease.isArchived) {
    return (
      <div className={baseClassName}>
        {lease.unitId ? (
          <Link
            aria-label={`Open ${lease.unitLabel}`}
            className={`${buttonClassName} hover:text-foreground`}
            href={`/units/${lease.unitId}`}
            onClick={(event) => event.stopPropagation()}
            prefetch={false}
            title="Open unit"
          >
            <ExternalLink size={14} />
          </Link>
        ) : null}
        <button
          aria-label={`Restore lease for ${lease.tenantName}`}
          className={`${buttonClassName} hover:text-accent`}
          onClick={(event) => {
            event.stopPropagation();
            onRestoreLease(lease);
          }}
          title="Restore lease"
          type="button"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={baseClassName}>
      {lease.unitId ? (
        <Link
          aria-label={`Open ${lease.unitLabel}`}
          className={`${buttonClassName} hover:text-foreground`}
          href={`/units/${lease.unitId}`}
          onClick={(event) => event.stopPropagation()}
          prefetch={false}
          title="Open unit"
        >
          <ExternalLink size={14} />
        </Link>
      ) : null}
      <button
        aria-label={`Edit lease for ${lease.tenantName}`}
        className={`${buttonClassName} hover:text-foreground`}
        onClick={(event) => {
          event.stopPropagation();
          onEditLease(lease);
        }}
        title="Edit lease"
        type="button"
      >
        <Pencil size={14} />
      </button>
      <button
        aria-label={`Archive lease for ${lease.tenantName}`}
        className={`${buttonClassName} hover:text-danger`}
        onClick={(event) => {
          event.stopPropagation();
          onArchiveLease(lease);
        }}
        title="Archive lease"
        type="button"
      >
        <Archive size={14} />
      </button>
    </div>
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
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}

function TableMoneyDisplay({
  showSecondary = true,
  value,
}: {
  showSecondary?: boolean;
  value: MoneyDisplayValue;
}) {
  const primary = formatMoneyWithSymbol(value.primary, value.primaryCurrency);
  const secondary = formatMoneyWithSymbol(
    value.secondary,
    value.secondaryCurrency,
  );

  return (
    <span
      className="flex min-w-0 flex-col items-end gap-0.5 text-right tabular-nums"
      title={showSecondary ? `${primary} / ${secondary}` : primary}
    >
      <span className="max-w-full truncate font-semibold leading-5 text-foreground">
        {primary}
      </span>
      {showSecondary ? (
        <span className="max-w-full truncate text-xs leading-4 text-muted">
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

function formatMoneyWithSymbol(label: string, currency: CurrencyCode) {
  const isNegative = label.startsWith("-");
  const unsignedLabel = isNegative ? label.slice(1) : label;
  const codePrefix = `${currency} `;
  const amount = unsignedLabel.startsWith(codePrefix)
    ? unsignedLabel.slice(codePrefix.length)
    : unsignedLabel;
  const symbol = currency === "USD" ? "$" : "\u17db";

  return `${isNegative ? "-" : ""}${symbol}${amount}`;
}
