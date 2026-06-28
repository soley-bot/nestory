import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  Users,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates/format";
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
  if (!lease) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4 2xl:sticky 2xl:top-5">
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
    "inline-flex h-8 items-center justify-center rounded-md border border-border font-medium text-foreground transition-colors hover:bg-surface-muted";
  const primaryIconButtonClassName =
    "inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted";

  return (
    <aside className="rounded-md border border-border bg-surface 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-170px)] 2xl:overflow-auto">
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
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Detail label="Start" value={lease.startDateLabel} />
          <Detail label="End" value={lease.endDateLabel} />
          <Detail label="Monthly rent" wide>
            <MoneyDisplay value={lease.rentDisplay} />
          </Detail>
          <Detail label="Deposit" wide>
            {lease.depositDisplay ? (
              <MoneyDisplay value={lease.depositDisplay} />
            ) : (
              lease.depositLabel
            )}
          </Detail>
        </dl>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <CheckCircle2 size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Next action
            </p>
          </div>
          <Badge className="mt-2" tone={lease.nextAction.tone}>
            {lease.nextAction.label}
          </Badge>
          <p className="mt-2 text-xs leading-5 text-muted">
            {lease.nextAction.description}
          </p>
          <Link
            className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border border-border text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
            href={lease.nextAction.href}
            prefetch={false}
          >
            Open action
          </Link>
        </section>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <AlertTriangle size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Risk
            </p>
          </div>
          <div className="mt-2 space-y-2">
            {lease.riskIndicators.map((indicator) => (
              <div key={indicator.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-medium">
                    {indicator.label}
                  </p>
                  <Badge tone={indicator.tone}>{indicator.tone}</Badge>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  {indicator.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <Users size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Tenant parties
            </p>
          </div>
          {lease.parties.length === 0 ? (
            <>
              <p className="mt-2 text-sm font-medium">{lease.partySummary}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                No durable People link is visible.
              </p>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              {lease.parties.slice(0, 3).map((party) => (
                <Link
                  className="block rounded-md border border-border bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted"
                  href={party.href}
                  key={party.id}
                  prefetch={false}
                >
                  <span className="block break-words font-medium">
                    {party.label}
                  </span>
                  <span className="mt-0.5 block break-words text-xs text-muted">
                    {party.roleLabel}
                    {party.isPrimary ? " / Primary" : ""} / {party.contactLabel}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <Building2 size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Occupancy
            </p>
          </div>
          <p className="mt-2 text-sm font-medium">{lease.occupancyLabel}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {lease.propertyName}
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <CalendarDays size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Terms and deposits
            </p>
          </div>
          <div className="mt-2 space-y-2">
            {lease.terms.length === 0 ? (
              <MiniRow label="Current term" value={lease.termLabel} />
            ) : (
              lease.terms.slice(0, 2).map((term) => (
                <MiniRow
                  key={term.id}
                  label={`${term.statusLabel} term`}
                  value={`${term.datesLabel} / ${term.rentLabel}`}
                />
              ))
            )}
            {lease.deposits.length === 0 ? (
              <MiniRow label="Deposit" value={lease.depositLabel} />
            ) : (
              lease.deposits.slice(0, 2).map((deposit) => (
                <MiniRow
                  key={deposit.id}
                  label={`${deposit.typeLabel} deposit`}
                  value={`${deposit.amountLabel} / ${deposit.statusLabel}`}
                />
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <FileText size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Documents
            </p>
          </div>
          <div className="mt-2 space-y-2">
            {lease.documents.length === 0 ? (
              <MiniRow label="Evidence" value="No lease documents attached" />
            ) : (
              lease.documents.slice(0, 3).map((document) =>
                document.url ? (
                  <a
                    className="block rounded-md border border-border bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted"
                    href={document.url}
                    key={document.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="block break-words font-medium">
                      {document.fileName}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {document.category} / {formatDate(document.uploadedAt)}
                    </span>
                  </a>
                ) : (
                  <MiniRow
                    key={document.id}
                    label={document.category}
                    value={document.fileName}
                  />
                ),
              )
            )}
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <ListTree size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              History
            </p>
          </div>
          <div className="mt-2 space-y-2">
            {lease.timeline.length === 0 ? (
              <MiniRow label="Timeline" value="No lease timeline events yet" />
            ) : (
              lease.timeline.slice(0, 3).map((event) => (
                <Link
                  className="block rounded-md border border-border bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted"
                  href={event.href}
                  key={event.id}
                  prefetch={false}
                >
                  <span className="block break-words font-medium">
                    {event.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {event.eventDateLabel} / {event.typeLabel}
                  </span>
                </Link>
              ))
            )}
            {lease.activity.length === 0 ? (
              <MiniRow label="Activity" value="No lease activity yet" />
            ) : (
              lease.activity.slice(0, 3).map((change) => (
                <Link
                  className="block rounded-md border border-border bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted"
                  href={change.href}
                  key={change.id}
                  prefetch={false}
                >
                  <span className="block break-words font-medium">
                    {change.actionLabel}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {formatDate(change.createdAt)} / {change.recordLabel}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <div className="grid grid-cols-4 gap-2 text-sm">
          <Link
            aria-label={`Open lease for ${lease.tenantName}`}
            className={iconButtonClassName}
            href={getLeaseHref(lease.id)}
            prefetch={false}
            title="Open lease"
          >
            <ExternalLink size={15} />
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
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open timeline filtered to ${lease.tenantName}`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={lease.hrefs.timeline}
            title="Open lease timeline"
          >
            <ListTree size={15} />
          </Link>
          <Link
            aria-label={`Open ledger filtered to ${lease.tenantName}`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={lease.hrefs.ledger}
            title="Open lease ledger"
          >
            <Landmark size={15} />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm">
      <p className="break-words font-medium">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
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
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
