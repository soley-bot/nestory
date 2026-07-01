import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Landmark,
  ListTree,
  Ruler,
  ScrollText,
  UserRound,
  Wrench,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { formatUnitTimelineContext } from "@/features/units/data/unit-summary";
import type {
  UnitDetail,
  UnitDocumentContext,
  UnitLedgerContext,
  UnitMaintenanceContext,
  UnitTimelineContext,
} from "@/features/units/unit.types";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";

export function UnitDetailView({ unit }: { unit: UnitDetail }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent"
        href="/units"
      >
        <ArrowLeft size={15} />
        Units
      </Link>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
        <div className="space-y-3 xl:overflow-auto xl:pr-1">
          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid min-w-0 gap-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start">
                <UnitHeroPhoto unit={unit} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-base font-semibold">
                      {unit.propertyCode} / Unit {unit.unitNumber}
                    </h2>
                    <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
                    {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
                  </div>
                  <p className="mt-1 break-words text-sm text-muted">
                    {unit.propertyName} / Floor {unit.floorLabel} / {unit.sizeLabel}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionLink href={unit.hrefs.property} icon={<Building2 size={14} />}>
                  Property
                </ActionLink>
                <ActionLink href={unit.hrefs.leases} icon={<ScrollText size={14} />}>
                  Leases
                </ActionLink>
                <ActionLink href={unit.hrefs.ledger} icon={<Landmark size={14} />}>
                  Ledger
                </ActionLink>
                <ActionLink href={unit.hrefs.maintenance} icon={<Wrench size={14} />}>
                  Maintenance
                </ActionLink>
                <ActionLink href={unit.hrefs.timeline} icon={<ListTree size={14} />}>
                  Timeline
                </ActionLink>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <Detail label="Property" value={unit.propertyName}>
                <Building2 size={14} />
              </Detail>
              <Detail label="Unit" value={unit.unitNumber} />
              <Detail label="Floor" value={unit.floorLabel} />
              <Detail label="Size" value={unit.sizeLabel}>
                <Ruler size={14} />
              </Detail>
              <Detail
                label="Current rent"
                moneyValue={unit.rentDisplay}
                value={unit.rentLabel}
              />
              <Detail label="Ledger net" moneyValue={unit.ledgerNetDisplay} />
              <Detail label="Occupancy" value={unit.hasActiveLease ? "Leased" : "No active lease"} />
              <Detail
                label="Records"
                value={`${unit.counts.ledgerEntries} ledger / ${unit.counts.timelineEvents} timeline / ${unit.counts.maintenanceCases ?? 0} maintenance / ${unit.counts.documents} docs`}
              />
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={unit.financialSummary.periodLabel}
              icon={<Landmark size={16} />}
              title="Unit performance"
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Revenue"
                value={<MoneyDisplay size="large" value={unit.financialSummary.incomeDisplay} />}
              />
              <Metric
                label="Expenses"
                value={<MoneyDisplay size="large" value={unit.financialSummary.expenseDisplay} />}
              />
              <Metric
                label="NOI"
                note={unit.financialSummary.marginLabel}
                value={<MoneyDisplay size="large" value={unit.financialSummary.noiDisplay} />}
              />
              <Metric
                label="Repair cost"
                note={unit.financialSummary.maintenanceRatioLabel}
                value={
                  <MoneyDisplay
                    size="large"
                    value={unit.financialSummary.maintenanceExpenseDisplay}
                  />
                }
              />
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={unit.activeLease ? unit.activeLease.statusLabel : "No active lease"}
              icon={<ScrollText size={16} />}
              title="Lease and tenant"
            />
            {unit.activeLease ? (
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
                <div className="rounded-md border border-border bg-surface-muted/60 p-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="text-muted" size={15} />
                    <p className="text-sm font-semibold">People links</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {unit.tenantLinks.length === 0 ? (
                      <p className="text-sm leading-6 text-muted">
                        This lease has a tenant name, but no active People record is linked.
                      </p>
                    ) : (
                      unit.tenantLinks.map((person) => (
                        <Link
                          className="block rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
                          href={person.href}
                          key={person.id}
                        >
                          <span className="block break-words font-medium">
                            {person.displayName}
                          </span>
                          <span className="mt-1 block break-words text-xs text-muted">
                            {person.roleLabel} / {person.contactLabel}
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <p className="text-sm leading-6 text-muted">
                  No active lease is linked to this unit. Create a lease to close the
                  occupancy record and connect a tenant.
                </p>
                <ActionLink
                  className="mt-3"
                  href={unit.hrefs.addLease}
                  icon={<ScrollText size={14} />}
                  strong
                >
                  Add lease
                </ActionLink>
              </div>
            )}
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${unit.counts.ledgerEntries} active ledger rows`}
              icon={<Landmark size={16} />}
              title="Ledger history"
            />
            <div className="divide-y divide-border">
              {unit.recentLedgerEntries.length === 0 ? (
                <EmptyRow
                  actionHref={unit.hrefs.addLedgerEntry}
                  actionLabel="Add ledger entry"
                  label="No unit-level ledger entries yet."
                />
              ) : null}
              {unit.recentLedgerEntries.map((entry) => (
                <LedgerRow entry={entry} key={entry.id} />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${unit.counts.openMaintenanceCases ?? 0} open / ${
                unit.counts.overdueMaintenanceCases ?? 0
              } overdue`}
              icon={<Wrench size={16} />}
              title="Maintenance cases"
            />
            <div className="divide-y divide-border">
              {unit.recentMaintenanceCases.length === 0 ? (
                <EmptyRow
                  actionHref={unit.hrefs.addMaintenanceCase}
                  actionLabel="New case"
                  label="No unit-level maintenance cases yet."
                />
              ) : null}
              {unit.recentMaintenanceCases.map((maintenanceCase) => (
                <MaintenanceRow
                  maintenanceCase={maintenanceCase}
                  key={maintenanceCase.id}
                />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${unit.counts.timelineEvents} active timeline records`}
              icon={<ListTree size={16} />}
              title="Timeline and maintenance"
            />
            <div className="divide-y divide-border">
              {unit.recentTimelineEvents.length === 0 ? (
                <EmptyRow
                  actionHref={unit.hrefs.addTimelineEvent}
                  actionLabel="Add timeline event"
                  label="No unit-level timeline events yet."
                />
              ) : null}
              {unit.recentTimelineEvents.map((event) => (
                <TimelineRow event={event} key={event.id} />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${unit.counts.documents} active evidence records`}
              icon={<FileText size={16} />}
              title="Documents and evidence"
            />
            <div className="divide-y divide-border">
              {unit.documents.length === 0 ? (
                <EmptyRow
                  actionHref={unit.hrefs.documents}
                  actionLabel="Open documents"
                  label="No unit-scoped documents or receipts yet."
                />
              ) : null}
              {unit.documents.map((document) => (
                <DocumentRow document={document} key={document.id} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-3 xl:overflow-auto xl:pr-1">
          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <Wrench className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Next action</h2>
            </div>
            <div className="mt-3 rounded-md border border-border bg-surface-muted/60 p-3">
              <Badge tone={unit.repairAction.tone}>{unit.repairAction.label}</Badge>
              <p className="mt-2 text-sm leading-6 text-muted">
                {unit.repairAction.description}
              </p>
              <ActionLink
                className="mt-3"
                href={unit.repairAction.href}
                icon={<Wrench size={14} />}
                strong
              >
                Open action
              </ActionLink>
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Health and risk</h2>
            </div>
            <div className="mt-3 space-y-2">
              {unit.healthIndicators.map((indicator) => (
                <div
                  className="rounded-md border border-border bg-surface-muted/60 p-3"
                  key={indicator.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-medium">
                      {indicator.label}
                    </p>
                    <Badge tone={indicator.tone}>{indicator.tone}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {indicator.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Record completeness</h2>
            </div>
            <dl className="mt-4 grid grid-cols-4 gap-2 text-sm">
              <CountDetail label="Ledger" value={unit.counts.ledgerEntries} />
              <CountDetail label="Timeline" value={unit.counts.timelineEvents} />
              <CountDetail label="Cases" value={unit.counts.maintenanceCases ?? 0} />
              <CountDetail label="Docs" value={unit.counts.documents} />
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Recent activity</h2>
            </div>
            <div className="mt-3 space-y-2">
              {unit.activity.length === 0 ? (
                <p className="text-sm leading-6 text-muted">
                  No unit profile activity has been recorded yet.
                </p>
              ) : (
                unit.activity.map((change) => (
                  <ActivityRow change={change} key={change.id} />
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ActionLink({
  children,
  className = "",
  href,
  icon,
  strong = false,
}: {
  children: ReactNode;
  className?: string;
  href: string;
  icon: ReactNode;
  strong?: boolean;
}) {
  return (
    <Link
      className={`${className} inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] font-medium transition-colors hover:bg-surface-muted ${
        strong ? "bg-foreground text-background hover:bg-foreground/90" : "text-foreground"
      }`}
      href={href}
      prefetch={false}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

function UnitHeroPhoto({ unit }: { unit: UnitDetail }) {
  const className =
    "flex aspect-[4/3] w-full max-w-[160px] items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted text-muted sm:max-w-none";

  if (unit.thumbnailUrl) {
    return (
      <div
        aria-hidden="true"
        className={`${className} bg-cover bg-center`}
        style={{ backgroundImage: `url(${unit.thumbnailUrl})` }}
      />
    );
  }

  return (
    <div className={className} aria-hidden="true">
      <Building2 size={22} />
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

function Metric({
  label,
  note,
  value,
}: {
  label: string;
  note?: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-muted/60 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-2">{value}</div>
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
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

function EmptyRow({
  actionHref,
  actionLabel,
  label,
}: {
  actionHref: string;
  actionLabel: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted">{label}</p>
      <ActionLink href={actionHref} icon={<FileText size={14} />}>
        {actionLabel}
      </ActionLink>
    </div>
  );
}

function TimelineRow({ event }: { event: UnitTimelineContext }) {
  return (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
      href={`/timeline?eventId=${event.id}&archiveState=all${
        event.unitId ? `&unitId=${event.unitId}` : ""
      }`}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted">
            {formatUnitTimelineContext(event)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone="neutral">{event.eventType}</Badge>
          {event.costDisplay ? (
            <MoneyDisplay align="right" value={event.costDisplay} />
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function LedgerRow({ entry }: { entry: UnitLedgerContext }) {
  return (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
      href={`/ledger?entryId=${entry.id}&archiveState=all`}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{entry.category}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <CalendarDays size={13} />
            <span>{formatDate(entry.transactionDate)}</span>
            <Badge tone={entry.direction === "expense" ? "warning" : "success"}>
              {entry.direction}
            </Badge>
          </div>
        </div>
        <MoneyDisplay align="right" value={entry.amountDisplay} />
      </div>
    </Link>
  );
}

function MaintenanceRow({
  maintenanceCase,
}: {
  maintenanceCase: UnitMaintenanceContext;
}) {
  return (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
      href={maintenanceCase.href}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{maintenanceCase.title}</p>
          <p className="mt-1 text-xs text-muted">
            {maintenanceCase.category} / {maintenanceCase.dueLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone={maintenanceCase.statusTone}>
            {maintenanceCase.statusLabel}
          </Badge>
          <Badge tone="neutral">{maintenanceCase.priorityLabel}</Badge>
          <span className="text-xs font-medium text-muted">
            {maintenanceCase.actualCostLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DocumentRow({ document }: { document: UnitDocumentContext }) {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="break-words font-medium">{document.fileName}</p>
        <p className="mt-1 text-xs text-muted">
          {document.category} / {document.linkedRecordLabel} /{" "}
          {formatDate(document.uploadedAt)}
        </p>
      </div>
      <FileText className="shrink-0 text-muted" size={15} />
    </div>
  );

  if (document.url) {
    return (
      <a
        className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
        href={document.url}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  if (document.linkedRecordHref) {
    return (
      <Link
        className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
        href={document.linkedRecordHref}
        prefetch={false}
      >
        {content}
      </Link>
    );
  }

  return <div className="px-4 py-3 text-sm">{content}</div>;
}

function ActivityRow({ change }: { change: RecentChange }) {
  return (
    <Link
      className="block rounded-md border border-border bg-surface-muted/60 px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
      href={change.href}
      prefetch={false}
    >
      <p className="break-words font-medium">{change.actionLabel}</p>
      <p className="mt-1 text-xs text-muted">
        {formatDate(change.createdAt)} / {change.recordLabel}
      </p>
    </Link>
  );
}
