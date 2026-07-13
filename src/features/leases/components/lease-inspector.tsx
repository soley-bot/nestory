"use client";
import Link from "next/link";
import { useActionState } from "react";
import {
  Archive,
  ExternalLink,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  Users,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { recordLeaseDepositEventAction, reverseLeaseDepositEventAction } from "@/features/leases/actions";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import type { LeaseSummary } from "@/features/leases/lease.types";

type LeaseInspectorProps = {
  getLeaseHref: (id: string) => string;
  lease: LeaseSummary | null;
  onArchiveLease: (lease: LeaseSummary) => void;
  onEditLease: (lease: LeaseSummary) => void;
  onRestoreLease: (lease: LeaseSummary) => void;
};

export function LeaseInspector({
  getLeaseHref,
  lease,
  onArchiveLease,
  onEditLease,
  onRestoreLease,
}: LeaseInspectorProps) {
  const [depositState, recordDepositEvent, depositPending] = useActionState(recordLeaseDepositEventAction, {});
  const [reversalState, reverseDepositEvent, reversalPending] = useActionState(reverseLeaseDepositEventAction, {});
  if (!lease) {
    return (
      <aside className="bg-surface p-4">
        <div className="flex items-center gap-2">
          <Users className="text-muted" size={16} />
          <h2 className="text-base font-semibold">Lease inspector</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Select a lease row to inspect tenant parties, term dates, rent,
          deposit, occupancy, and linked records.
        </p>
      </aside>
    );
  }

  const iconButtonClassName =
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted";
  const primaryIconButtonClassName =
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground transition-colors hover:bg-surface-muted";

  return (
    <aside className="bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
              {lease.propertyCode}
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              {lease.tenantName}
            </h2>
            <p className="mt-1 break-words text-sm text-muted">
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
          <Detail
            label="Term"
            value={`${lease.startDateLabel} - ${lease.endDateLabel}`}
          />
          <Detail label="Rent">
            <MoneyDisplay value={lease.rentDisplay} />
          </Detail>
        </dl>

        {lease.deposits.length ? (
          <section className="space-y-3 border-t border-border pt-4" aria-label="Security deposit events">
            <div><h3 className="text-sm font-semibold">Security deposit</h3><p className="text-xs text-muted">Held tenant funds are separate from property income.</p></div>
            {lease.deposits.map((deposit) => <div className="space-y-2 rounded-md border border-border p-3" key={deposit.id}>
              <div className="flex justify-between gap-3 text-sm"><span>{deposit.typeLabel}</span><span>Held <MoneyDisplay value={deposit.heldBalanceDisplay} /></span></div>
              <form action={recordDepositEvent} className="grid grid-cols-2 gap-2">
                <input name="leaseDepositId" type="hidden" value={deposit.id} />
                <SelectControl name="eventType" options={[{label:"Receipt",value:"received"},{label:"Application",value:"applied"},{label:"Retention",value:"retained"},{label:"Refund",value:"refunded"}]} />
                <DatePickerField name="eventDate" defaultValue={getBusinessDateValue()} />
                <NumberInput name="amount" placeholder="Amount" required />
                <Input name="reference" placeholder="Reference" />
                <Button disabled={depositPending} type="submit">{depositPending ? "Saving..." : "Record event"}</Button>
              </form>
              {depositState.message ? <p className="text-xs" role="status">{depositState.message}</p> : null}
              <div className="space-y-1">{deposit.events.map((event) => <div className="flex items-center justify-between gap-2 text-xs" key={event.id}><span>{event.eventDate} · {event.eventType} · <MoneyDisplay value={event.amountDisplay} /> {event.reference}</span>{event.reversible ? <form action={reverseDepositEvent}><input name="eventId" type="hidden" value={event.id}/><input name="eventDate" type="hidden" value={getBusinessDateValue()}/><Button disabled={reversalPending} type="submit">Reverse</Button></form> : null}</div>)}</div>
              {reversalState.message ? <p className="text-xs" role="status">{reversalState.message}</p> : null}
            </div>)}
          </section>
        ) : null}

        <AttentionNote
          href={lease.nextAction.href}
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
          {lease.unitId ? (
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
          ) : (
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
          )}
          {lease.isArchived ? (
            <button
              aria-label={`Restore lease for ${lease.tenantName}`}
              className={primaryIconButtonClassName}
              onClick={() => onRestoreLease(lease)}
              title="Restore lease"
              type="button"
            >
              <RotateCcw size={15} />
              <span className="truncate">Restore</span>
            </button>
          ) : (
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
          )}
          {!lease.isArchived ? (
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
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open timeline filtered to ${lease.tenantName}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={lease.hrefs.timeline}
            title="Open lease timeline"
          >
            <ListTree size={15} />
            <span className="truncate">Timeline</span>
          </Link>
          <Link
            aria-label={`Open ledger filtered to ${lease.tenantName}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={lease.hrefs.ledger}
            title="Open lease ledger"
          >
            <Landmark size={15} />
            <span className="truncate">Ledger</span>
          </Link>
        </div>
      </div>
    </aside>
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
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
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
  href: string;
  item?: LeaseSummary["riskIndicators"][number];
  label: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold">{item?.label ?? label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? "Review" : "Action"}
          </Badge>
          {item ? null : (
            <Link
              aria-label="Open action"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
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
