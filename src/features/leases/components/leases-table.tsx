import type { ReactNode } from "react";
import {
  previewRowClassName,
  RecordLink,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { Badge } from "@/components/ui/badge";
import type { LeaseArchiveState, LeaseSummary } from "@/features/leases/lease.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type LeasesTableProps = {
  archiveState: LeaseArchiveState;
  getLeaseHref: (id: string) => string;
  leases: LeaseSummary[];
  onOpenLease: (id: string) => void;
  onSelectLease: (id: string) => void;
  selectedLeaseId: string;
};

export function LeasesTable({
  archiveState,
  getLeaseHref,
  leases,
  onOpenLease,
  onSelectLease,
  selectedLeaseId,
}: LeasesTableProps) {
  return (
    <div>
      <div className="max-h-[330px] space-y-3 overflow-auto pr-1 md:hidden">
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
            onOpenLease={onOpenLease}
            onSelectLease={onSelectLease}
            selected={selectedLeaseId === lease.id}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
        <div className="max-h-[min(620px,calc(100vh-320px))] overflow-auto">
          <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-[13px]">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[24%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-2 py-2.5 font-semibold">Tenant</th>
                <th className="px-2 py-2.5 font-semibold">Unit</th>
                <th className="px-2 py-2.5 font-semibold">Term</th>
                <th className="px-2 py-2.5 text-right font-semibold">Rent</th>
                <th className="px-3 py-2.5 font-semibold">Review</th>
              </tr>
            </thead>
            <tbody>
              {leases.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                    {getEmptyMessage(archiveState)}
                  </td>
                </tr>
              ) : null}
              {leases.map((lease) => (
                <tr
                  className={cn(
                    previewRowClassName,
                    selectedLeaseId === lease.id && selectedPreviewRowClassName,
                    lease.isArchived && "text-muted",
                  )}
                  key={lease.id}
                  onClick={() => onSelectLease(lease.id)}
                  onDoubleClick={() => onOpenLease(lease.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectLease(lease.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-2 py-2.5 align-middle">
                    <RecordLink
                      href={getLeaseHref(lease.id)}
                      title={`Open lease for ${lease.tenantName}`}
                    >
                      {lease.tenantName}
                    </RecordLink>
                    <p
                      className="mt-0.5 truncate text-xs text-muted"
                      title={lease.partySummary}
                    >
                      {lease.partySummary}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 align-middle">
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
                  <td className="px-2 py-2.5 align-middle">
                    <p className="truncate font-medium">{lease.startDateLabel}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      Ends {lease.endDateLabel}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-right align-middle">
                    <TableMoneyDisplay value={lease.rentDisplay} />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                      <Badge className="px-2 text-xs" tone={lease.statusTone}>
                        {lease.statusLabel}
                      </Badge>
                      {lease.riskIndicators[0] ? (
                        <Badge
                          className="px-2 text-xs"
                          tone={lease.riskIndicators[0].tone}
                        >
                          {lease.riskIndicators[0].label}
                        </Badge>
                      ) : null}
                      {lease.isArchived ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          Archived
                        </Badge>
                      ) : null}
                      <p
                        className="min-w-0 shrink truncate text-xs text-muted"
                        title={lease.nextAction.description}
                      >
                        {lease.nextAction.label}
                      </p>
                    </div>
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
  getLeaseHref,
  lease,
  onOpenLease,
  onSelectLease,
  selected,
}: {
  getLeaseHref: (id: string) => string;
  lease: LeaseSummary;
  onOpenLease: (id: string) => void;
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
      onDoubleClick={() => onOpenLease(lease.id)}
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
          <RecordLink
            className="text-base font-semibold leading-5"
            href={getLeaseHref(lease.id)}
            title={`Open lease for ${lease.tenantName}`}
          >
            {lease.tenantName}
          </RecordLink>
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
        <LeaseCardDetail label="Next action" value={lease.nextAction.label} />
        <LeaseCardDetail
          align="right"
          label="Review"
          value={lease.riskIndicators[0]?.label ?? "Ready"}
        />
      </dl>
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
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}

function TableMoneyDisplay({ value }: { value: MoneyDisplayValue }) {
  const primary = formatMoneyWithSymbol(value.primary);

  return (
    <span
      className="flex min-w-0 flex-col items-end gap-0.5 text-right tabular-nums"
      title={primary}
    >
      <span className="max-w-full truncate font-semibold leading-5 text-foreground">
        {primary}
      </span>
    </span>
  );
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
