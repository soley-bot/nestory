"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  Archive,
  ExternalLink,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  recordLeaseDepositEventAction,
  reverseLeaseDepositEventAction,
  scheduleFutureRentTermAction,
} from "@/features/leases/actions";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import type { LeaseSummary } from "@/features/leases/lease.types";

type LeaseInspectorProps = {
  canConfigure: boolean;
  getLeaseHref: (id: string) => string;
  lease: LeaseSummary | null;
  onArchiveLease: (lease: LeaseSummary) => void;
  onEditLease: (lease: LeaseSummary) => void;
  onRestoreLease: (lease: LeaseSummary) => void;
};

export function LeaseInspector({
  canConfigure,
  getLeaseHref,
  lease,
  onArchiveLease,
  onEditLease,
  onRestoreLease,
}: LeaseInspectorProps) {
  const [depositState, recordDepositEvent, depositPending] = useActionState(recordLeaseDepositEventAction, {});
  const [reversalState, reverseDepositEvent, reversalPending] = useActionState(reverseLeaseDepositEventAction, {});
  const [scheduleState, scheduleFutureTerm, schedulePending] = useActionState(
    scheduleFutureRentTermAction,
    {},
  );
  const [scheduleIdempotencySeed] = useState(() => crypto.randomUUID());
  if (!lease) {
    return null;
  }

  const displayedTerm =
    lease.terms.find((term) => term.id === lease.rentReadiness.termId) ??
    lease.terms[0];
  const activeTerm = lease.terms.find((term) => term.status === "active");
  const scheduleIdempotencyKey = [
    scheduleIdempotencySeed,
    lease.id,
    activeTerm?.endDate ?? "no-active-term",
    lease.terms.length,
  ].join(":");
  const iconButtonClassName =
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";
  const primaryIconButtonClassName =
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="bg-card">
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
              {lease.unitLabel}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
            {lease.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Start" value={lease.startDateLabel} />
          <Detail label="End" value={lease.endDateLabel} />
          <Detail label="Rent">
            <MoneyDisplay value={lease.rentDisplay} />
          </Detail>
          <Detail
            label="Payment activity"
            value={`${lease.recordCounts.ledgerEntries} ledger ${lease.recordCounts.ledgerEntries === 1 ? "entry" : "entries"}`}
          />
          <Detail label="Deposit" value={getDepositSummary(lease)} wide />
        </dl>

        <section
          aria-label="Rent readiness"
          className="rounded-md border border-border p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {lease.rentReadiness.label}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {lease.rentReadiness.repairLabel}
              </p>
            </div>
            <Badge tone={lease.rentReadiness.tone}>
              {lease.rentReadiness.reasonCode.replaceAll("_", " ")}
            </Badge>
          </div>
          {displayedTerm ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Detail label="Term" value={displayedTerm.datesLabel} />
              <Detail label="Due" value={displayedTerm.dueLabel} />
              <Detail
                label="Frequency"
                value={displayedTerm.paymentFrequencyLabel}
              />
              <Detail label="Lifecycle" value={displayedTerm.statusLabel} />
            </dl>
          ) : null}
          {canConfigure ? (
            <Link
              className="mt-3 inline-flex text-xs font-medium text-accent hover:underline"
              href="/settings/rent-policy"
            >
              Open rent policy
            </Link>
          ) : null}
        </section>

        {canConfigure && activeTerm && !lease.isArchived ? (
          <section
            aria-label="Future rent term"
            className="rounded-md border border-border p-3"
          >
            <h3 className="text-sm font-semibold">Schedule future rent</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The active term keeps its identity. Only its unused future range
              is shortened when the upcoming term is saved.
            </p>
            <form
              action={scheduleFutureTerm}
              className="mt-3 grid gap-3"
              key={`${lease.id}:${activeTerm.id}`}
            >
              <input name="leaseId" type="hidden" value={lease.id} />
              <input
                name="supersedesTermId"
                type="hidden"
                value={activeTerm.id}
              />
              <input
                name="idempotencyKey"
                type="hidden"
                value={scheduleIdempotencyKey}
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-medium">
                  <span>Effective date</span>
                  <DatePickerField
                    ariaLabel="Future term effective date"
                    name="startDate"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  <span>Term end</span>
                  <DatePickerField
                    ariaLabel="Future term end date"
                    name="endDate"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  <span>Rent amount</span>
                  <NumberInput
                    defaultValue={activeTerm.rentAmount}
                    min="0"
                    name="rentAmount"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  <span>Due day</span>
                  <NumberInput
                    defaultValue={
                      activeTerm.rentDueDay ?? undefined
                    }
                    max="31"
                    min="1"
                    name="rentDueDay"
                    required
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium">
                <span>Payment frequency</span>
                <SelectControl
                  ariaLabel="Future term payment frequency"
                  defaultValue={
                    activeTerm.paymentFrequency ?? "monthly"
                  }
                  name="paymentFrequency"
                  options={[
                    { label: "Monthly", value: "monthly" },
                    { label: "Quarterly", value: "quarterly" },
                    { label: "Semi-annual", value: "semi_annual" },
                    { label: "Annual", value: "annual" },
                    { label: "One time", value: "one_time" },
                  ]}
                  required
                />
              </label>
              <Button disabled={schedulePending} type="submit">
                {schedulePending ? "Scheduling..." : "Schedule future term"}
              </Button>
              {scheduleState.message ? (
                <p
                  className={
                    scheduleState.status === "error"
                      ? "text-xs text-danger"
                      : "text-xs text-muted-foreground"
                  }
                  role="status"
                >
                  {scheduleState.message}
                </p>
              ) : null}
            </form>
            {lease.terms.length > 1 ? (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-medium">Term history</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {lease.terms.map((term) => (
                    <li key={term.id}>
                      {term.datesLabel} · {term.rentLabel} · {term.statusLabel}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {lease.deposits.length ? (
          <section className="space-y-3 border-t border-border pt-4" aria-label="Security deposit events">
            <div><h3 className="text-sm font-semibold">Security deposit</h3><p className="text-xs text-muted-foreground">Held tenant funds are separate from property income.</p></div>
            {lease.deposits.map((deposit) => <div className="space-y-2 rounded-md border border-border p-3" key={deposit.id}>
              <div className="flex justify-between gap-3 text-sm"><span>{deposit.typeLabel}</span><span>Held <MoneyDisplay value={deposit.heldBalanceDisplay} /></span></div>
              {canConfigure ? (
                <form action={recordDepositEvent} className="grid grid-cols-2 gap-2">
                <input name="leaseDepositId" type="hidden" value={deposit.id} />
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>Event type</span>
                  <SelectControl
                    ariaLabel="Deposit event type"
                    name="eventType"
                    options={[{label:"Receipt",value:"received"},{label:"Application",value:"applied"},{label:"Retention",value:"retained"},{label:"Refund",value:"refunded"}]}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>Event date</span>
                  <DatePickerField
                    ariaLabel="Deposit event date"
                    name="eventDate"
                    defaultValue={getBusinessDateValue()}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>Amount</span>
                  <NumberInput name="amount" required />
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>Reference</span>
                  <Input name="reference" />
                </label>
                  <Button className="col-span-2" disabled={depositPending} type="submit">{depositPending ? "Saving..." : "Record event"}</Button>
                </form>
              ) : null}
              {canConfigure && depositState.message ? <p className="text-xs" role="status">{depositState.message}</p> : null}
              <div className="space-y-1">{deposit.events.map((event) => <div className="flex items-center justify-between gap-2 text-xs" key={event.id}><span>{event.eventDate} · {event.eventType} · <MoneyDisplay value={event.amountDisplay} /> {event.reference}</span>{canConfigure && event.reversible ? <form action={reverseDepositEvent}><input name="eventId" type="hidden" value={event.id}/><input name="eventDate" type="hidden" value={getBusinessDateValue()}/><Button disabled={reversalPending} type="submit">Reverse</Button></form> : null}</div>)}</div>
              {canConfigure && reversalState.message ? <p className="text-xs" role="status">{reversalState.message}</p> : null}
            </div>)}
          </section>
        ) : null}

        <AttentionNote
          href={canConfigure ? lease.nextAction.href : undefined}
          item={getAttentionItem(lease.riskIndicators)}
          label={lease.nextAction.label}
        />

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Link
            aria-label={`Open lease for ${lease.tenantName}`}
            className={iconButtonClassName}
            href={getLeaseHref(lease.id)}
            prefetch={false}
            title="Open lease"
          >
            <ExternalLink size={15} />
            <span className="truncate">Open lease</span>
          </Link>
          {canConfigure && lease.unitId ? (
            <Link
              aria-label={`Open ${lease.unitLabel}`}
              className={iconButtonClassName}
              href={`/units/${lease.unitId}`}
              prefetch={false}
              title="Open unit"
            >
              <ExternalLink size={15} />
              <span className="truncate">Open unit</span>
            </Link>
          ) : canConfigure ? (
            <Link
              aria-label={`Open property ${lease.propertyCode}`}
              className={iconButtonClassName}
              href={`/properties/${lease.propertyId}`}
              prefetch={false}
              title="Open property"
            >
              <ExternalLink size={15} />
              <span className="truncate">Open property</span>
            </Link>
          ) : null}
          {canConfigure && lease.isArchived ? (
            <button
              aria-label={`Review restore requirements for ${lease.tenantName}`}
              className={primaryIconButtonClassName}
              onClick={() => onRestoreLease(lease)}
              title="Review restore requirements"
              type="button"
            >
              <RotateCcw size={15} />
              <span className="truncate">Restore review</span>
            </button>
          ) : canConfigure ? (
            <button
              aria-label={`Edit lease for ${lease.tenantName}`}
              className={iconButtonClassName}
              onClick={() => onEditLease(lease)}
              title="Edit lease"
              type="button"
            >
              <Pencil size={15} />
              <span className="truncate">Edit</span>
            </button>
          ) : null}
          {canConfigure && !lease.isArchived ? (
            <button
              aria-label={`Archive lease for ${lease.tenantName}`}
              className={`${iconButtonClassName} text-danger hover:text-danger`}
              onClick={() => onArchiveLease(lease)}
              title="Archive lease"
              type="button"
            >
              <Archive size={15} />
              <span className="truncate">Archive</span>
            </button>
          ) : canConfigure ? (
            <span aria-hidden="true" />
          ) : null}
        </div>

        {canConfigure ? (
          <div className="grid grid-cols-2 gap-2">
            <Link
              aria-label={`Open timeline filtered to ${lease.tenantName}`}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href={lease.hrefs.timeline}
              title="Open lease timeline"
            >
              <ListTree size={15} />
              <span className="truncate">Timeline</span>
            </Link>
            <Link
              aria-label={`Open ledger filtered to ${lease.tenantName}`}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href={lease.hrefs.ledger}
              title="Open lease ledger"
            >
              <Landmark size={15} />
              <span className="truncate">Ledger</span>
            </Link>
          </div>
        ) : null}
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
    <div
      className={
        wide
          ? "col-span-2 min-w-0 rounded-md border border-border px-3 py-2.5"
          : "min-w-0 rounded-md border border-border px-3 py-2.5"
      }
    >
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}

function AttentionNote({
  href,
  item,
  label,
}: {
  href?: string;
  item?: LeaseSummary["riskIndicators"][number];
  label: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold">{item?.label ?? label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? "Review" : "Action"}
          </Badge>
          {item || !href ? null : (
            <Link
              aria-label="Open action"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-accent transition-colors hover:bg-muted"
              href={href}
              prefetch={false}
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

function getAttentionItem(items: LeaseSummary["riskIndicators"]) {
  return items.find((item) => item.tone !== "success");
}

function getDepositSummary(lease: LeaseSummary) {
  const deposit = lease.deposits[0];

  if (deposit) {
    return `${deposit.heldBalanceDisplay.primary} held`;
  }

  return lease.depositLabel;
}
