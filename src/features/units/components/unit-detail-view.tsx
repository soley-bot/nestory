import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  Landmark,
  ListTree,
  Ruler,
  ScrollText,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { formatUnitTimelineContext } from "@/features/units/data/unit-summary";
import type {
  UnitDetail,
  UnitLedgerContext,
  UnitTimelineContext,
} from "@/features/units/unit.types";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";

export function UnitDetailView({ unit }: { unit: UnitDetail }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent"
        href="/units"
      >
        <ArrowLeft size={15} />
        Units
      </Link>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:overflow-hidden">
        <div className="space-y-3 xl:overflow-auto xl:pr-1">
          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Unit record</h2>
                <p className="mt-1 break-words text-sm text-muted">
                  {unit.propertyCode} / {unit.propertyName}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
                {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <Detail label="Property" value={unit.propertyName}>
                <Link
                  className="text-accent hover:underline"
                  href={`/properties/${unit.propertyId}`}
                  prefetch={false}
                >
                  {unit.propertyCode}
                </Link>
              </Detail>
              <Detail label="Unit" value={unit.unitNumber} />
              <Detail label="Floor" value={unit.floorLabel} />
              <Detail label="Size" value={unit.sizeLabel}>
                <Ruler size={14} />
              </Detail>
              <Detail label="Current rent" moneyValue={unit.rentDisplay} value={unit.rentLabel} />
              <Detail label="Ledger net" moneyValue={unit.ledgerNetDisplay} />
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${unit.counts.timelineEvents} active timeline records`}
              icon={<ListTree size={16} />}
              title="Recent timeline"
            />
            <div className="divide-y divide-border">
              {unit.recentTimelineEvents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">
                  No unit-level timeline events yet.
                </p>
              ) : null}
              {unit.recentTimelineEvents.map((event) => (
                <TimelineRow event={event} key={event.id} />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${unit.counts.ledgerEntries} active ledger rows`}
              icon={<Landmark size={16} />}
              title="Recent ledger"
            />
            <div className="divide-y divide-border">
              {unit.recentLedgerEntries.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">
                  No unit-level ledger entries yet.
                </p>
              ) : null}
              {unit.recentLedgerEntries.map((entry) => (
                <LedgerRow entry={entry} key={entry.id} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-3 xl:overflow-auto xl:pr-1">
          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <ScrollText className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Active lease</h2>
            </div>
            {unit.activeLease ? (
              <dl className="mt-4 space-y-3 text-sm">
                <Detail label="Tenant" value={unit.activeLease.tenantName} />
                <Detail label="Status" value={unit.activeLease.statusLabel} />
                <Detail
                  label="Lease dates"
                  value={`${formatDate(unit.activeLease.startDate)} - ${formatDate(
                    unit.activeLease.endDate,
                  )}`}
                />
                <Detail
                  label="Monthly rent"
                  moneyValue={unit.activeLease.monthlyRentDisplay}
                />
              </dl>
            ) : (
              <p className="mt-4 text-sm leading-6 text-muted">
                No active lease is linked to this unit.
              </p>
            )}
          </section>

          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <FileText className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Record counts</h2>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <CountDetail label="Timeline" value={unit.counts.timelineEvents} />
              <CountDetail label="Ledger" value={unit.counts.ledgerEntries} />
              <CountDetail label="Docs" value={unit.counts.documents} />
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <Building2 className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Relationship</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              This unit belongs to {unit.propertyCode}. Timeline events, ledger
              rows, leases, and documents can stay at the property level or attach
              directly to this unit.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({
  children,
  label,
  moneyValue,
  value,
}: {
  children?: ReactNode;
  label: string;
  moneyValue?: MoneyDisplayValue;
  value?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {children}
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">
        {moneyValue ? <MoneyDisplay value={moneyValue} /> : value}
      </dd>
    </div>
  );
}

function CountDetail({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-center">
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

function SectionTitle({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
}

function TimelineRow({ event }: { event: UnitTimelineContext }) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted">
            {formatUnitTimelineContext(event)}
          </p>
        </div>
        <Badge tone="neutral">{event.eventType}</Badge>
      </div>
    </div>
  );
}

function LedgerRow({ entry }: { entry: UnitLedgerContext }) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{entry.category}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <CalendarDays size={13} />
            <span>{formatDate(entry.transactionDate)}</span>
            {entry.description ? (
              <>
                <span aria-hidden="true">/</span>
                <span className="break-words">{entry.description}</span>
              </>
            ) : null}
          </div>
        </div>
        <MoneyDisplay align="right" value={entry.amountDisplay} />
      </div>
    </div>
  );
}
