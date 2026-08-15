"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import type { LeaseSummary } from "@/features/leases/lease.types";

type LeaseInspectorProps = {
  getLeaseHref: (id: string) => string;
  lease: LeaseSummary | null;
};

export function LeaseInspector({ getLeaseHref, lease }: LeaseInspectorProps) {
  if (!lease) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-col bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {lease.propertyCode}
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              {lease.tenantName}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              <Link
                className="font-medium text-foreground outline-none hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                href={lease.hrefs.property}
                prefetch={false}
              >
                {lease.propertyName}
              </Link>{" "}
              /{" "}
              {lease.hrefs.unit ? (
                <Link
                  className="font-medium text-foreground outline-none hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  href={lease.hrefs.unit}
                  prefetch={false}
                >
                  {lease.unitLabel}
                </Link>
              ) : (
                lease.unitLabel
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
            {lease.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Detail label="Term" value={`${lease.startDateLabel} - ${lease.endDateLabel}`} wide />
          <Detail label="Rent">
            <MoneyDisplay value={lease.rentDisplay} />
          </Detail>
          <Detail label="Deposit" value={getDepositSummary(lease)} />
        </dl>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Next action
          </p>
          {lease.nextAction.href ? (
            <Link
              className="mt-1 inline-flex rounded-sm text-sm font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              href={lease.nextAction.href}
              prefetch={false}
            >
              {lease.nextAction.label}
            </Link>
          ) : (
            <p className="mt-1 text-sm font-medium">
              {lease.nextAction.label}
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {lease.nextAction.description}
          </p>
        </div>

        <Link
          className="mt-auto inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          href={getLeaseHref(lease.id)}
          prefetch={false}
        >
          Open lease record
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </div>
    </div>
  );
}

function Detail({
  children,
  label,
  value,
  wide = false,
}: {
  children?: React.ReactNode;
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}

function getDepositSummary(lease: LeaseSummary) {
  const deposit = lease.deposits[0];

  if (deposit) {
    return `${deposit.heldBalanceDisplay.primary} held`;
  }

  return lease.depositLabel;
}
