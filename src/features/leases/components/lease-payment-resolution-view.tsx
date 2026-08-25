"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TenantInvoicePaymentForm,
  type TenantPaymentReceiptResult,
} from "@/features/finance-operations/components/tenant-invoice-payment-form";
import type {
  LeasePaymentResolutionData,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import type { LeaseSummary } from "@/features/leases/lease.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type LeasePaymentResolutionViewProps = {
  canRecordPayments: boolean;
  canViewFinance: boolean;
  lease: LeaseSummary;
  onPaymentSuccess: (message: string) => void;
  onReceiptResult: (result: TenantPaymentReceiptResult) => void;
  resolution: LeasePaymentResolutionData;
  returnHref: string;
};

export function LeasePaymentResolutionView({
  canRecordPayments,
  canViewFinance,
  lease,
  onPaymentSuccess,
  onReceiptResult,
  resolution,
  returnHref,
}: LeasePaymentResolutionViewProps) {
  const { invoice } = resolution;
  const balanceDisplay = formatMoneyDisplay(invoice.balanceDue).primary;
  const deposit = getDepositPresentation(lease);
  const recentActivity = getRecentActivity({
    canViewFinance,
    invoice,
    lease,
  });
  const upcoming = getUpcoming(lease, resolution.nextInvoiceDueDate);
  const canSubmit =
    canRecordPayments && resolution.reconciliationSources.length > 0;

  return (
    <div className="workspace-gutter-x pb-8">
      <section
        aria-labelledby="lease-resolution-heading"
        className="border-t border-border py-5"
      >
        <h2
          className="text-xl font-semibold"
          id="lease-resolution-heading"
        >
          Resolve outstanding rent
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {balanceDisplay} was due {formatDate(invoice.dueDate)} for{" "}
          {invoice.lines[0]?.label ?? "this invoice"}.
        </p>
        <ol
          aria-label="Payment resolution progress"
          className="mt-4 grid gap-2 sm:grid-cols-3"
        >
          <ProgressStep label="Invoice reviewed" state="complete" />
          <ProgressStep label="Record payment" state="current" />
          <ProgressStep label="Receipt created" state="future" />
        </ol>
      </section>

      <div className="grid border-t border-border lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="payment-to-record-heading"
          className="py-6 lg:pr-8"
        >
          <h2
            className="text-base font-semibold"
            id="payment-to-record-heading"
          >
            Payment to record
          </h2>
          {canSubmit ? (
            <TenantInvoicePaymentForm
              invoice={invoice}
              onReceiptResult={onReceiptResult}
              onSuccess={onPaymentSuccess}
              ownerLabel={resolution.ownerLabel}
              reconciliationSources={resolution.reconciliationSources}
              submitLabel={`Record ${balanceDisplay} payment`}
            />
          ) : (
            <ReadOnlyPaymentSummary
              canViewFinance={canViewFinance}
              invoice={invoice}
              leaseId={lease.id}
              reason={
                canRecordPayments
                  ? "No receiving account is available."
                  : "Payment recording is not available."
              }
            />
          )}
          <Button
            asChild
            className="mt-2 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            variant="ghost"
          >
            <Link href={returnHref}>Payment is not received</Link>
          </Button>
        </section>

        <aside
          aria-labelledby="lease-context-heading"
          className="border-t border-border py-6 lg:border-l lg:border-t-0 lg:pl-8"
        >
          <h2 className="text-base font-semibold" id="lease-context-heading">
            Lease context
          </h2>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <ContextRow label="Unit" value={lease.unitLabel} />
            <ContextRow label="Monthly rent" value={lease.rentDisplay.primary} />
            <ContextRow label="Deposit">
              <span className="font-medium">{deposit.amount}</span>
              {deposit.state ? (
                deposit.state === "Received" ? (
                  <Badge tone="success">Received</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {deposit.state}
                  </span>
                )
              ) : null}
            </ContextRow>
            <ContextRow label="Lease end" value={lease.endDateLabel} />
          </dl>
          <Button
            asChild
            className="-ml-2 mt-3 text-muted-foreground"
            variant="ghost"
          >
            <Link href={returnHref}>Open full lease record</Link>
          </Button>
        </aside>
      </div>

      <section
        aria-labelledby="recent-activity-heading"
        className="border-t border-border py-6"
      >
        <h2 className="text-base font-semibold" id="recent-activity-heading">
          Recent activity
        </h2>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {recentActivity.map((item) => (
            <li
              className="grid gap-1 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
              key={item.id}
            >
              <span className="text-muted-foreground">
                {formatDate(item.date)}
              </span>
              <span className="font-medium">{item.activity}</span>
              <span className="text-muted-foreground">{item.recordLabel}</span>
              {item.href ? (
                <Link
                  aria-label={`View ${item.viewLabel}`}
                  className="w-fit font-medium text-primary underline-offset-2 hover:underline"
                  href={item.href}
                >
                  View
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {upcoming.length > 0 ? (
        <section
          aria-labelledby="upcoming-heading"
          className="border-t border-border py-6"
        >
          <h2 className="text-base font-semibold" id="upcoming-heading">
            Upcoming
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {upcoming.map((item) => (
              <li
                className="grid gap-1 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"
                key={`${item.label}:${item.date}`}
              >
                <span className="text-muted-foreground">
                  {formatDate(item.date)}
                </span>
                <span className="font-medium">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ProgressStep({
  label,
  state,
}: {
  label: string;
  state: "complete" | "current" | "future";
}) {
  const stateLabel =
    state === "complete" ? "Complete" : state === "current" ? "Current" : "Next";

  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "flex items-baseline justify-between gap-3 border-t-2 py-3 text-sm",
        state === "complete" && "border-success",
        state === "current" && "border-primary",
        state === "future" && "border-border",
      )}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "text-xs",
          state === "complete" && "text-success",
          state === "current" && "text-primary",
          state === "future" && "text-muted-foreground",
        )}
      >
        {stateLabel}
      </span>
    </li>
  );
}

function ReadOnlyPaymentSummary({
  canViewFinance,
  invoice,
  leaseId,
  reason,
}: {
  canViewFinance: boolean;
  invoice: TenantInvoiceSummary;
  leaseId: string;
  reason: string;
}) {
  return (
    <div className="mt-4">
      <dl className="divide-y divide-border border-y border-border">
        <ReadOnlyRow label="Invoice" value={invoice.invoiceNumber} />
        <ReadOnlyRow
          label="Amount due"
          value={formatMoneyDisplay(invoice.balanceDue).primary}
        />
        <ReadOnlyRow label="Due date" value={formatDate(invoice.dueDate)} />
        <ReadOnlyRow label="Tenant" value={invoice.recipientLabel} />
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{reason}</p>
        {canViewFinance ? (
          <Link
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            href={`/rent-income?leaseId=${leaseId}`}
          >
            Open in Finance
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,0.35fr)_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ContextRow({
  children,
  label,
  value,
}: {
  children?: ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className="py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
        {children ?? value}
      </dd>
    </div>
  );
}

function getDepositPresentation(lease: LeaseSummary) {
  const deposit = lease.deposits[0];
  if (!deposit) return { amount: "No deposit required", state: null };
  if (deposit.receivedAmount >= deposit.amount) {
    return { amount: deposit.amountDisplay.primary, state: "Received" };
  }
  if (deposit.receivedAmount > 0) {
    return {
      amount: deposit.amountDisplay.primary,
      state: `${formatMoneyDisplay(deposit.receivedAmount, deposit.currency).primary} received`,
    };
  }
  return { amount: deposit.amountDisplay.primary, state: "Not received" };
}

type RecentActivityItem = {
  activity: string;
  date: string;
  href: string | null;
  id: string;
  order: number;
  recordLabel: string;
  viewLabel: string;
};

function getRecentActivity({
  canViewFinance,
  invoice,
  lease,
}: {
  canViewFinance: boolean;
  invoice: TenantInvoiceSummary;
  lease: LeaseSummary;
}) {
  const financeHref = canViewFinance
    ? `/rent-income?leaseId=${lease.id}`
    : null;
  const candidates: RecentActivityItem[] = [
    {
      activity: "Invoice issued",
      date: invoice.issueDate,
      href: invoice.pdf.href ?? financeHref,
      id: invoice.id,
      order: 0,
      recordLabel: invoice.invoiceNumber,
      viewLabel: invoice.invoiceNumber,
    },
    ...lease.activity.map((change, index) => ({
      activity: change.actionLabel,
      date: change.createdAt,
      href: change.href ?? null,
      id: change.id,
      order: index + 1,
      recordLabel: change.recordLabel,
      viewLabel: change.actionLabel,
    })),
  ];
  const seen = new Set<string>();

  return candidates
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(compareRecentActivity)
    .slice(0, 3);
}

function compareRecentActivity(
  left: RecentActivityItem,
  right: RecentActivityItem,
) {
  const leftDate = Date.parse(left.date);
  const rightDate = Date.parse(right.date);

  if (
    Number.isFinite(leftDate) &&
    Number.isFinite(rightDate) &&
    leftDate !== rightDate
  ) {
    return rightDate - leftDate;
  }

  return left.order - right.order;
}

function getUpcoming(
  lease: LeaseSummary,
  nextInvoiceDueDate: string | null,
) {
  const upcomingTerm = lease.terms.find((term) => term.status === "upcoming");
  const items = [
    nextInvoiceDueDate
      ? { date: nextInvoiceDueDate, label: "Next invoice due" }
      : null,
    lease.activationSchedule?.status === "pending"
      ? {
          date: lease.activationSchedule.activationDate,
          label: "Lease activation",
        }
      : null,
    upcomingTerm
      ? { date: upcomingTerm.startDate, label: "Scheduled Lease term" }
      : null,
    lease.formValues.leaseEndDate
      ? { date: lease.formValues.leaseEndDate, label: "Lease ends" }
      : null,
  ];
  const today = getBusinessDateValue();

  return items.filter(isPresent).filter((item) => item.date >= today).slice(0, 3);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
