"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  Landmark,
  ListTree,
  ScrollText,
  UserRound,
  Wrench,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { PhotoGallery } from "@/features/photos/components/photo-gallery";
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
import type { ReportKind } from "@/features/reports/reports.types";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type PropertyRecordSection =
  | "overview"
  | "photos"
  | "units"
  | "finance"
  | "maintenance"
  | "documents"
  | "reports"
  | "timeline";

const propertyRecordSections: Array<{
  id: PropertyRecordSection;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "photos", label: "Photos" },
  { id: "units", label: "Units" },
  { id: "finance", label: "Finance" },
  { id: "maintenance", label: "Maintenance" },
  { id: "documents", label: "Documents" },
  { id: "reports", label: "Reports" },
  { id: "timeline", label: "Timeline" },
];

const propertyReportTemplates: Array<{
  description: string;
  kind: ReportKind;
  sources: string;
  title: string;
}> = [
  {
    description: "Unit status, tenants, lease dates, current rent, and evidence count.",
    kind: "rent-roll",
    sources: "Units / leases / documents",
    title: "Rent roll",
  },
  {
    description: "Income, expenses, NOI, maintenance spend, and missing-record risks.",
    kind: "property-performance",
    sources: "Ledger / units / timeline",
    title: "Property performance",
  },
  {
    description: "Owner-ready income, expense, and net position for the selected period.",
    kind: "owner-statement",
    sources: "Ledger / owners",
    title: "Owner statement",
  },
  {
    description: "Category-level income and expense rows for finance review.",
    kind: "income-expense",
    sources: "Ledger / units",
    title: "Income and expense",
  },
  {
    description: "Repair cost, estimates, completion state, priority, and source records.",
    kind: "maintenance-cost",
    sources: "Maintenance / ledger / timeline",
    title: "Maintenance cost",
  },
  {
    description: "Vacancy, missing lease/rent evidence, and leasing follow-up risk.",
    kind: "vacancy-risk",
    sources: "Units / leases / documents",
    title: "Vacancy and risk",
  },
  {
    description: "Lease expirations by unit so renewal work does not surprise the team.",
    kind: "lease-expiry",
    sources: "Leases / units",
    title: "Lease expiry",
  },
  {
    description: "Missing owners, leases, rent, and document evidence to clean up.",
    kind: "missing-data",
    sources: "Property record quality",
    title: "Missing data",
  },
];

export function PropertyDetailView({ property }: { property: PropertyDetail }) {
  const [activeSection, setActiveSection] =
    useState<PropertyRecordSection>("overview");
  const reportMonth = getBusinessMonthValue();

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent"
        href="/properties"
      >
        <ArrowLeft size={15} />
        Properties
      </Link>
      <PropertyRecordNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className="space-y-3">
          <section
            className={cn(
              "rounded-md border border-border bg-surface p-4",
              activeSection !== "overview" && "hidden",
            )}
            id="property-overview"
          >
            <div className="flex flex-col gap-3">
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
              <Detail label="Photos" value={String(property.counts.photos)} />
              <Detail label="Active leases" value={String(property.counts.activeLeases)} />
              <Detail label="Notes" value={property.notesLabel} />
            </dl>
          </section>

          <div
            className={cn(activeSection !== "photos" && "hidden")}
            id="property-photos"
          >
            <PhotoGallery
              emptyLabel="No property photos yet."
              photos={property.photos}
              propertyId={property.id}
              title="Property photos"
            />
          </div>

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "finance" && "hidden",
            )}
            id="property-finance"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "overview" && "hidden",
            )}
            id="property-ownership"
          >
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
                    property.activeLeases.slice(0, 3).map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "units" && "hidden",
            )}
            id="property-units"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "finance" && "hidden",
            )}
            id="property-ledger"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "maintenance" && "hidden",
            )}
            id="property-maintenance"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "timeline" && "hidden",
            )}
            id="property-timeline"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "documents" && "hidden",
            )}
            id="property-documents"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "reports" && "hidden",
            )}
            id="property-reports"
          >
            <PropertyReportsPanel property={property} reportMonth={reportMonth} />
          </section>

          {property.activity.length > 0 ? (
            <section
              className={cn(
                "rounded-md border border-border bg-surface",
                activeSection !== "overview" && "hidden",
              )}
              id="property-activity"
            >
              <SectionTitle
                description={`${property.activity.length} recent profile changes`}
                icon={<CalendarDays size={16} />}
                title="Recent activity"
              />
              <div className="grid gap-2 p-4 lg:grid-cols-2 2xl:grid-cols-3">
                {property.activity.slice(0, 3).map((change) => (
                  <ActivityRow change={change} key={change.id} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PropertyRecordNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: PropertyRecordSection;
  onSectionChange: (section: PropertyRecordSection) => void;
}) {
  return (
    <nav
      aria-label="Property record sections"
      className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2"
    >
      <div className="flex min-w-max items-center gap-1.5" role="tablist">
        {propertyRecordSections.map((item) => (
          <button
            aria-selected={activeSection === item.id}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
              activeSection === item.id && "bg-accent-soft text-foreground",
            )}
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PropertyReportsPanel({
  property,
  reportMonth,
}: {
  property: PropertyDetail;
  reportMonth: string;
}) {
  return (
    <>
      <SectionTitle
        description="Property-scoped CSV and PDF exports"
        icon={<FileText size={16} />}
        title="Reports"
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Report workspace</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Build owner packets, finance reviews, leasing checks, maintenance
              summaries, and cleanup queues from the same traceable records used
              across this property.
            </p>
            <div className="mt-3 grid gap-2 text-[12px] text-muted sm:grid-cols-3">
              <ReportMetaPill label="Scope" value={property.code} />
              <ReportMetaPill label="Period" value={reportMonth} />
              <ReportMetaPill
                label="Sources"
                value={`${property.totalUnitCount} units / ${property.counts.ledgerEntries} ledger`}
              />
            </div>
          </div>
          <ActionLink
            href={buildPropertyReportHref(property.id, "rent-roll", reportMonth)}
            icon={<ExternalLink size={14} />}
            strong
          >
            Open builder
          </ActionLink>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {propertyReportTemplates.map((template) => (
            <ReportTemplateCard
              key={template.kind}
              propertyId={property.id}
              reportMonth={reportMonth}
              template={template}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ReportTemplateCard({
  propertyId,
  reportMonth,
  template,
}: {
  propertyId: string;
  reportMonth: string;
  template: (typeof propertyReportTemplates)[number];
}) {
  return (
    <div className="flex min-h-[176px] flex-col justify-between rounded-md border border-border bg-surface-muted/60 p-3">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold">{template.title}</h3>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.06em] text-muted">
              {template.sources}
            </p>
          </div>
          <FileText className="shrink-0 text-muted" size={15} />
        </div>
        <p className="mt-3 text-sm leading-5 text-muted">{template.description}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionLink
          href={buildPropertyReportHref(propertyId, template.kind, reportMonth)}
          icon={<ExternalLink size={14} />}
        >
          Preview
        </ActionLink>
        <ActionLink
          href={buildPropertyReportExportHref(propertyId, template.kind, reportMonth)}
          icon={<Download size={14} />}
        >
          CSV
        </ActionLink>
        <ActionLink
          href={buildPropertyReportPdfHref(propertyId, template.kind, reportMonth)}
          icon={<Download size={14} />}
        >
          PDF
        </ActionLink>
      </div>
    </div>
  );
}

function ReportMetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-2.5 py-2">
      <p className="font-medium uppercase tracking-[0.06em]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function buildPropertyReportHref(
  propertyId: string,
  report: ReportKind,
  month: string,
) {
  return buildPropertyReportUrl("/reports", propertyId, report, month);
}

function buildPropertyReportExportHref(
  propertyId: string,
  report: ReportKind,
  month: string,
) {
  return buildPropertyReportUrl("/api/reports/export", propertyId, report, month);
}

function buildPropertyReportPdfHref(
  propertyId: string,
  report: ReportKind,
  month: string,
) {
  return buildPropertyReportUrl("/api/reports/pdf", propertyId, report, month);
}

function buildPropertyReportUrl(
  pathname: string,
  propertyId: string,
  report: ReportKind,
  month: string,
) {
  const params = new URLSearchParams({
    month,
    propertyId,
    report,
  });

  return `${pathname}?${params.toString()}`;
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
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="break-words font-medium">{lease.tenantName}</p>
          <p className="mt-1 text-xs text-muted">
            {lease.unitLabel} / {lease.termLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-start gap-3 sm:justify-end">
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
