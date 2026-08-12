"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
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
import {
  buildReportBuilderHref,
  reportCatalog,
  type CurrentReportKind,
} from "@/features/reports/report-catalog";
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

export function PropertyDetailView({ property }: { property: PropertyDetail }) {
  const [activeSection, setActiveSection] =
    useState<PropertyRecordSection>("overview");
  const reportMonth = getBusinessMonthValue();

  return (
    <div className="flex flex-col gap-5 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
      <PropertyRecordNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <PropertyRecordPanel
          activeSection={activeSection}
          property={property}
          reportMonth={reportMonth}
        />
      </div>
    </div>
  );
}

function PropertyRecordPanel({
  activeSection,
  property,
  reportMonth,
}: {
  activeSection: PropertyRecordSection;
  property: PropertyDetail;
  reportMonth: string;
}) {
  const content = getPropertyRecordPanelContent({ activeSection, property, reportMonth });

  return (
    <div
      aria-labelledby={`property-tab-${activeSection}`}
      className="space-y-6"
      id={`property-panel-${activeSection}`}
      role="tabpanel"
    >
      {content}
    </div>
  );
}

function getPropertyRecordPanelContent({
  activeSection,
  property,
  reportMonth,
}: {
  activeSection: PropertyRecordSection;
  property: PropertyDetail;
  reportMonth: string;
}) {
  if (activeSection === "photos") {
    return (
      <PhotoGallery
        emptyLabel="No property photos yet."
        photos={property.photos}
        propertyId={property.id}
        title="Property photos"
      />
    );
  }

  if (activeSection === "units") {
    return (
      <section id="property-units">
        <SectionTitle
          description={`${property.totalUnitCount} unit records`}
          icon={<Building2 size={16} />}
          title="Units"
        />
        <div className="pt-4">
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
    );
  }

  if (activeSection === "finance") {
    return (
      <>
        <section id="property-finance">
          <SectionTitle
            description={property.financialSummary.periodLabel}
            icon={<Landmark size={16} />}
            title="Property performance"
          />
          <dl
            aria-label="Financial summary"
            className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Metric
              label="Revenue"
              value={<MoneyDisplay size="large" value={property.financialSummary.incomeDisplay} />}
            />
            <Metric
              label="Expenses"
              value={<MoneyDisplay size="large" value={property.financialSummary.expenseDisplay} />}
            />
            <Metric
              label="NOI"
              note={property.financialSummary.marginLabel}
              value={<MoneyDisplay size="large" value={property.financialSummary.noiDisplay} />}
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
          </dl>
        </section>

        <section id="property-ledger">
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
      </>
    );
  }

  if (activeSection === "maintenance") {
    return (
      <section id="property-maintenance">
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
            <MaintenanceRow key={maintenanceCase.id} maintenanceCase={maintenanceCase} />
          ))}
        </div>
      </section>
    );
  }

  if (activeSection === "timeline") {
    return (
      <section id="property-timeline">
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
    );
  }

  if (activeSection === "documents") {
    return (
      <section id="property-documents">
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
    );
  }

  if (activeSection === "reports") {
    return (
      <section id="property-reports">
        <PropertyReportsPanel property={property} reportMonth={reportMonth} />
      </section>
    );
  }

  return (
    <>
      <section id="property-overview">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold">Property context</h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">{property.address}</p>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
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

      <section id="property-ownership">
        <SectionTitle
          description={`${property.activeLeases.length} current lease links`}
          icon={<ScrollText size={16} />}
          title="Owners and leases"
        />
        <div className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Ownership history</h3>
              {property.hrefs.ownerPerson ? (
                <ActionLink href={property.hrefs.ownerPerson} icon={<UserRound size={14} />}>
                  Owner
                </ActionLink>
              ) : null}
            </div>
            <div className="mt-3 divide-y divide-border">
              {property.ownerHistory.length === 0 ? (
                <EmptyBlock
                  actionHref={property.hrefs.propertiesList}
                  actionLabel="Review owner"
                  label="No owner/person history is linked yet."
                />
              ) : (
                property.ownerHistory.map((owner) => <OwnerRow key={owner.id} owner={owner} />)
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
            <div className="mt-3 divide-y divide-border">
              {property.activeLeases.length === 0 ? (
                <EmptyBlock
                  actionHref={property.hrefs.addLease}
                  actionLabel="Add lease"
                  label="No active leases are linked to this property."
                />
              ) : (
                property.activeLeases.slice(0, 3).map((lease) => <LeaseRow key={lease.id} lease={lease} />)
              )}
            </div>
          </div>
        </div>
      </section>

      {property.activity.length > 0 ? (
        <section id="property-activity">
          <SectionTitle
            description={`${property.activity.length} recent profile changes`}
            icon={<CalendarDays size={16} />}
            title="Recent activity"
          />
          <div className="grid divide-y divide-border pt-4 lg:grid-cols-2 lg:divide-x lg:divide-y-0 2xl:grid-cols-3">
            {property.activity.slice(0, 3).map((change) => (
              <ActivityRow change={change} key={change.id} />
            ))}
          </div>
        </section>
      ) : null}
    </>
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
      className="overflow-x-auto border-b border-border"
    >
      <div className="flex min-w-max items-center gap-1" role="tablist">
        {propertyRecordSections.map((item) => (
          <button
            aria-controls={
              activeSection === item.id ? `property-panel-${item.id}` : undefined
            }
            aria-selected={activeSection === item.id}
            className={cn(
              "inline-flex h-9 items-center border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              activeSection === item.id && "border-primary text-foreground",
            )}
            id={`property-tab-${item.id}`}
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
        description="Monthly owner activity and unit profit and loss"
        icon={<FileText size={16} />}
        title="Reports"
      />
      <div className="grid gap-2 p-4 md:grid-cols-2">
        {reportCatalog.map((statement) => (
          <Link
            className="group flex min-h-32 flex-col rounded-md border border-border bg-card p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            href={buildPropertyStatementHref(
              property.id,
              statement.kind,
              reportMonth,
            )}
            key={statement.kind}
            prefetch={false}
          >
            <h3 className="text-sm font-semibold">{statement.title}</h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {statement.description}
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs font-medium text-foreground">
              Open report
              <ExternalLink aria-hidden="true" size={13} />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function buildPropertyStatementHref(
  propertyId: string,
  report: CurrentReportKind,
  reportMonth: string,
) {
  const params = new URLSearchParams({
    month: reportMonth,
    propertyId,
  });

  return buildReportBuilderHref(report, params);
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
      className={`${className} inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted ${
        strong ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-foreground"
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
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
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
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2">{value}</dd>
      {note ? <dd className="mt-2 text-xs text-muted-foreground">{note}</dd> : null}
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
    <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
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
    <div className="rounded-md border border-border bg-muted/60 p-3 text-sm">
      <p className="text-muted-foreground">{label}</p>
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
      <p className="text-muted-foreground">{label}</p>
      <ActionLink href={actionHref} icon={<FileText size={14} />}>
        {actionLabel}
      </ActionLink>
    </div>
  );
}

function OwnerRow({ owner }: { owner: PropertyOwnerHistory }) {
  return (
    <Link
      className="block px-3 py-3 text-sm transition-colors hover:bg-muted"
      href={owner.href}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{owner.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
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
      className="block px-3 py-3 text-sm transition-colors hover:bg-muted"
      href={lease.href}
      prefetch={false}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="break-words font-medium">{lease.tenantName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
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
      className="block px-4 py-3 text-sm transition-colors hover:bg-muted"
      href={entry.href}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{entry.category}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
      className="block px-4 py-3 text-sm transition-colors hover:bg-muted"
      href={maintenanceCase.href}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{maintenanceCase.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {maintenanceCase.category} / {maintenanceCase.unitLabel} /{" "}
            {maintenanceCase.dueLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone={maintenanceCase.statusTone}>
            {maintenanceCase.statusLabel}
          </Badge>
          <span className="text-xs font-medium text-muted-foreground">
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
      className="block px-4 py-3 text-sm transition-colors hover:bg-muted"
      href={event.href}
      prefetch={false}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
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
        <p className="mt-1 text-xs text-muted-foreground">
          {document.category} / {document.linkedRecordLabel} /{" "}
          {formatDate(document.uploadedAt)}
        </p>
      </div>
      <FileText className="shrink-0 text-muted-foreground" size={15} />
    </div>
  );

  if (document.url) {
    return (
      <a
        className="block px-4 py-3 text-sm transition-colors hover:bg-muted"
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
        className="block px-4 py-3 text-sm transition-colors hover:bg-muted"
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
  const content = (
    <>
      <p className="break-words font-medium">{change.actionLabel}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatDate(change.createdAt)} / {change.recordLabel}
      </p>
    </>
  );

  return change.href ? (
    <Link
      className="block px-3 py-3 text-sm transition-colors hover:bg-muted"
      href={change.href}
      prefetch={false}
    >
      {content}
    </Link>
  ) : (
    <div className="px-3 py-3 text-sm">
      {content}
    </div>
  );
}
