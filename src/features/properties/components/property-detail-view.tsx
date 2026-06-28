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
  ScrollText,
  UserRound,
  Wrench,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { PropertyUnitsTable } from "@/features/properties/components/property-units-table";
import type {
  PropertyDetail,
  PropertyDetailLease,
  PropertyDocumentContext,
  PropertyLedgerContext,
  PropertyMaintenanceContext,
  PropertyOwnerHistory,
  PropertyTimelineContext,
} from "@/features/properties/data/property-detail";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";

export function PropertyDetailView({ property }: { property: PropertyDetail }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent"
        href="/properties"
      >
        <ArrowLeft size={15} />
        Properties
      </Link>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
        <div className="space-y-3 xl:overflow-auto xl:pr-1">
          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-base font-semibold">
                    {property.code} / {property.name}
                  </h2>
                  <Badge tone={property.statusTone}>{property.status}</Badge>
                  {property.isArchived ? <Badge tone="warning">Archived</Badge> : null}
                </div>
                <p className="mt-1 break-words text-sm text-muted">
                  {property.type} / {property.address}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionLink href={property.hrefs.units} icon={<Building2 size={14} />}>
                  Units
                </ActionLink>
                <ActionLink href={property.hrefs.leases} icon={<ScrollText size={14} />}>
                  Leases
                </ActionLink>
                <ActionLink href={property.hrefs.ledger} icon={<Landmark size={14} />}>
                  Ledger
                </ActionLink>
                <ActionLink href={property.hrefs.maintenance} icon={<Wrench size={14} />}>
                  Maintenance
                </ActionLink>
                <ActionLink href={property.hrefs.timeline} icon={<ListTree size={14} />}>
                  Timeline
                </ActionLink>
                <ActionLink href={property.hrefs.reports} icon={<FileText size={14} />}>
                  Reports
                </ActionLink>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <Detail label="Code" value={property.code} />
              <Detail label="Type" value={property.type} />
              <Detail label="Owner" value={property.owner}>
                <UserRound size={14} />
              </Detail>
              <Detail label="Units" value={property.unitSummary} />
              <Detail label="Net income" moneyValue={property.netIncome} />
              <Detail
                label="Records"
                value={`${property.counts.ledgerEntries} ledger / ${property.counts.timelineEvents} timeline / ${property.counts.maintenanceCases ?? 0} maintenance / ${property.counts.documents} docs`}
              />
              <Detail label="Active leases" value={String(property.counts.activeLeases)} />
              <Detail label="Notes" value={property.notesLabel} />
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={property.financialSummary.periodLabel}
              icon={<Landmark size={16} />}
              title="Property performance"
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Revenue"
                value={
                  <MoneyDisplay
                    size="large"
                    value={property.financialSummary.incomeDisplay}
                  />
                }
              />
              <Metric
                label="Expenses"
                value={
                  <MoneyDisplay
                    size="large"
                    value={property.financialSummary.expenseDisplay}
                  />
                }
              />
              <Metric
                label="NOI"
                note={property.financialSummary.marginLabel}
                value={
                  <MoneyDisplay
                    size="large"
                    value={property.financialSummary.noiDisplay}
                  />
                }
              />
              <Metric
                label="Repair cost"
                value={
                  <MoneyDisplay
                    size="large"
                    value={property.financialSummary.maintenanceExpenseDisplay}
                  />
                }
              />
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${property.activeLeases.length} current lease links`}
              icon={<ScrollText size={16} />}
              title="Owners and leases"
            />
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Ownership history</h3>
                  {property.hrefs.ownerPerson ? (
                    <ActionLink
                      href={property.hrefs.ownerPerson}
                      icon={<UserRound size={14} />}
                    >
                      Owner
                    </ActionLink>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {property.ownerHistory.length === 0 ? (
                    <EmptyBlock
                      actionHref={property.hrefs.propertiesList}
                      actionLabel="Review owner"
                      label="No owner/person history is linked yet."
                    />
                  ) : (
                    property.ownerHistory.map((owner) => (
                      <OwnerRow key={owner.id} owner={owner} />
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Active leases</h3>
                  <ActionLink href={property.hrefs.addLease} icon={<ScrollText size={14} />}>
                    Add lease
                  </ActionLink>
                </div>
                <div className="mt-3 space-y-2">
                  {property.activeLeases.length === 0 ? (
                    <EmptyBlock
                      actionHref={property.hrefs.addLease}
                      actionLabel="Add lease"
                      label="No active leases are linked to this property."
                    />
                  ) : (
                    property.activeLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${property.totalUnitCount} unit records`}
              icon={<Building2 size={16} />}
              title="Units"
            />
            <div className="p-4">
              {property.unitsList.length === 0 ? (
                <EmptyBlock
                  actionHref={property.hrefs.addUnit}
                  actionLabel="Add unit"
                  label="Property-only record. There are no units attached."
                />
              ) : (
                <PropertyUnitsTable units={property.unitsList} />
              )}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${property.counts.ledgerEntries} active ledger rows`}
              icon={<Landmark size={16} />}
              title="Ledger history"
            />
            <div className="divide-y divide-border">
              {property.recentLedgerEntries.length === 0 ? (
                <EmptyRow
                  actionHref={property.hrefs.addLedgerEntry}
                  actionLabel="Add ledger entry"
                  label="No property ledger entries yet."
                />
              ) : null}
              {property.recentLedgerEntries.map((entry) => (
                <LedgerRow entry={entry} key={entry.id} />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${property.counts.openMaintenanceCases ?? 0} open / ${
                property.counts.overdueMaintenanceCases ?? 0
              } overdue`}
              icon={<Wrench size={16} />}
              title="Maintenance cases"
            />
            <div className="divide-y divide-border">
              {property.recentMaintenanceCases.length === 0 ? (
                <EmptyRow
                  actionHref={property.hrefs.addMaintenanceCase}
                  actionLabel="New case"
                  label="No property maintenance cases yet."
                />
              ) : null}
              {property.recentMaintenanceCases.map((maintenanceCase) => (
                <MaintenanceRow
                  key={maintenanceCase.id}
                  maintenanceCase={maintenanceCase}
                />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${property.counts.timelineEvents} active timeline records`}
              icon={<ListTree size={16} />}
              title="Timeline history"
            />
            <div className="divide-y divide-border">
              {property.recentTimelineEvents.length === 0 ? (
                <EmptyRow
                  actionHref={property.hrefs.addTimelineEvent}
                  actionLabel="Add timeline event"
                  label="No property timeline events yet."
                />
              ) : null}
              {property.recentTimelineEvents.map((event) => (
                <TimelineRow event={event} key={event.id} />
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <SectionTitle
              description={`${property.counts.documents} active evidence records`}
              icon={<FileText size={16} />}
              title="Documents and evidence"
            />
            <div className="divide-y divide-border">
              {property.documents.length === 0 ? (
                <EmptyRow
                  actionHref={property.hrefs.documents}
                  actionLabel="Open documents"
                  label="No property-scoped evidence or receipts yet."
                />
              ) : null}
              {property.documents.map((document) => (
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
              <Badge tone={property.nextAction.tone}>{property.nextAction.label}</Badge>
              <p className="mt-2 text-sm leading-6 text-muted">
                {property.nextAction.description}
              </p>
              <ActionLink
                className="mt-3"
                href={property.nextAction.href}
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
              {property.healthIndicators.map((indicator) => (
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
              <CountDetail label="Ledger" value={property.counts.ledgerEntries} />
              <CountDetail label="Timeline" value={property.counts.timelineEvents} />
              <CountDetail label="Cases" value={property.counts.maintenanceCases ?? 0} />
              <CountDetail label="Docs" value={property.counts.documents} />
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-muted" size={16} />
              <h2 className="text-base font-semibold">Recent activity</h2>
            </div>
            <div className="mt-3 space-y-2">
              {property.activity.length === 0 ? (
                <p className="text-sm leading-6 text-muted">
                  No property profile activity has been recorded yet.
                </p>
              ) : (
                property.activity.map((change) => (
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

function EmptyBlock({
  actionHref,
  actionLabel,
  label,
}: {
  actionHref: string;
  actionLabel: string;
  label: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/60 p-3 text-sm">
      <p className="text-muted">{label}</p>
      <ActionLink className="mt-3" href={actionHref} icon={<FileText size={14} />}>
        {actionLabel}
      </ActionLink>
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

function OwnerRow({ owner }: { owner: PropertyOwnerHistory }) {
  return (
    <Link
      className="block rounded-md border border-border bg-surface-muted/60 px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
      href={owner.href}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{owner.label}</p>
          <p className="mt-1 text-xs text-muted">
            {owner.ownershipLabel} / {owner.periodLabel}
          </p>
        </div>
        <Badge tone={owner.isActive ? "success" : "neutral"}>
          {owner.isActive ? "Current" : owner.isArchived ? "Archived" : "Past"}
        </Badge>
      </div>
    </Link>
  );
}

function LeaseRow({ lease }: { lease: PropertyDetailLease }) {
  return (
    <Link
      className="block rounded-md border border-border bg-surface-muted/60 px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
      href={lease.href}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{lease.tenantName}</p>
          <p className="mt-1 text-xs text-muted">
            {lease.unitLabel} / {lease.termLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Badge tone="success">{lease.statusLabel}</Badge>
          <MoneyDisplay align="right" value={lease.rentDisplay} />
        </div>
      </div>
    </Link>
  );
}

function LedgerRow({ entry }: { entry: PropertyLedgerContext }) {
  return (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
      href={entry.href}
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
            <span aria-hidden="true">/</span>
            <span>{entry.unitLabel}</span>
          </div>
          {entry.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {entry.description}
            </p>
          ) : null}
        </div>
        <MoneyDisplay align="right" value={entry.amountDisplay} />
      </div>
    </Link>
  );
}

function MaintenanceRow({
  maintenanceCase,
}: {
  maintenanceCase: PropertyMaintenanceContext;
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
            {maintenanceCase.category} / {maintenanceCase.unitLabel} /{" "}
            {maintenanceCase.dueLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone={maintenanceCase.statusTone}>
            {maintenanceCase.statusLabel}
          </Badge>
          <span className="text-xs font-medium text-muted">
            {maintenanceCase.actualCostLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

function TimelineRow({ event }: { event: PropertyTimelineContext }) {
  return (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-surface-muted"
      href={event.href}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted">
            {formatDate(event.eventDate)} / {event.eventType} / {event.unitLabel}
          </p>
          {event.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {event.description}
            </p>
          ) : null}
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

function DocumentRow({ document }: { document: PropertyDocumentContext }) {
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
