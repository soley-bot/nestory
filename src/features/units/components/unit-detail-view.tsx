"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
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
import { PhotoGallery } from "@/features/photos/components/photo-gallery";
import { formatUnitTimelineContext } from "@/features/units/data/unit-summary";
import {
  buildUnitRecordHref,
  type UnitRecordSection,
} from "@/features/units/unit-detail-route";
import type {
  UnitDetail,
  UnitDocumentContext,
  UnitLedgerContext,
  UnitMaintenanceContext,
  UnitTimelineContext,
} from "@/features/units/unit.types";
import type { RecentChange } from "@/features/activity/activity.types";
import type { ReportKind } from "@/features/reports/reports.types";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const unitRecordSections: Array<{
  id: UnitRecordSection;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "photos", label: "Photos" },
  { id: "lease", label: "Lease" },
  { id: "finance", label: "Finance" },
  { id: "maintenance", label: "Maintenance" },
  { id: "documents", label: "Documents" },
  { id: "reports", label: "Reports" },
  { id: "timeline", label: "Timeline" },
];

const unitReportTemplates: Array<{
  description: string;
  kind: ReportKind;
  sources: string;
  title: string;
}> = [
  {
    description: "Monthly income, expenses, NOI, maintenance spend, and evidence count.",
    kind: "unit-performance",
    sources: "Ledger / timeline / documents",
    title: "Unit performance",
  },
  {
    description: "Tenant, occupancy status, current rent, lease end, and evidence count.",
    kind: "rent-roll",
    sources: "Unit / lease / documents",
    title: "Rent roll",
  },
  {
    description: "Unit-scoped income and expense rows for finance review.",
    kind: "income-expense",
    sources: "Ledger",
    title: "Income and expense",
  },
  {
    description: "Repair cost, estimates, priority, completion state, and linked records.",
    kind: "maintenance-cost",
    sources: "Maintenance / ledger / timeline",
    title: "Maintenance cost",
  },
  {
    description: "Lease end date, tenant, renewal window, and unit status.",
    kind: "lease-expiry",
    sources: "Lease / unit",
    title: "Lease expiry",
  },
  {
    description: "Vacancy, missing lease, missing rent, and missing evidence checks.",
    kind: "vacancy-risk",
    sources: "Unit / lease / documents",
    title: "Vacancy and risk",
  },
  {
    description: "Missing lease, rent, and evidence fields to clean up before reporting.",
    kind: "missing-data",
    sources: "Record quality",
    title: "Missing data",
  },
];

export function UnitDetailView({
  activeSection,
  sourceTaskId,
  unit,
}: {
  activeSection: UnitRecordSection;
  sourceTaskId?: string;
  unit: UnitDetail;
}) {
  const reportMonth = getBusinessMonthValue();
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
      <UnitRecordNav
        activeSection={activeSection}
        sourceTaskId={sourceTaskId}
        unitId={unit.id}
      />

      <div
        aria-label="Unit record details"
        className="min-h-0 flex-1 overflow-auto pr-1"
        role="region"
        tabIndex={0}
      >
        <div className="space-y-3">
          <section
            className={cn(
              "rounded-md border border-border bg-surface p-4",
              activeSection !== "overview" && "hidden",
            )}
            id="unit-overview"
          >
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-base font-semibold">
                    Unit context
                  </h2>
                </div>
                <p className="mt-1 break-words text-sm text-muted">
                  Floor {unit.floorLabel} / {unit.sizeLabel}
                </p>
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
                label="Tenant"
                value={unit.activeLease?.tenantName ?? "No active tenant"}
              >
                <UserRound size={14} />
              </Detail>
              <Detail
                label="Lease end"
                value={
                  unit.activeLease
                    ? formatDate(unit.activeLease.endDate)
                    : "No active lease"
                }
              />
              <Detail
                label="Current rent"
                moneyValue={unit.rentDisplay}
                value={unit.rentLabel}
              />
              <Detail label="Ledger net" moneyValue={unit.ledgerNetDisplay} />
              <Detail
                label="Maintenance"
                value={`${unit.counts.openMaintenanceCases ?? 0} open / ${
                  unit.counts.overdueMaintenanceCases ?? 0
                } overdue`}
              />
              <Detail
                label="Records"
                value={`${unit.counts.ledgerEntries} ledger / ${unit.counts.timelineEvents} timeline / ${unit.counts.maintenanceCases ?? 0} maintenance / ${unit.counts.documents} docs`}
              />
            </dl>
          </section>

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "overview" && "hidden",
            )}
            id="unit-record-quality"
          >
            <SectionTitle
              description="Lease, rent, evidence, and operating record checks"
              icon={<CheckCircle2 size={16} />}
              title="Record quality"
            />
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {unit.healthIndicators.map((indicator) => (
                  <div
                    className="rounded-md border border-border bg-surface-muted/60 p-3"
                    key={indicator.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-medium">
                        {indicator.label}
                      </p>
                      <Badge tone={indicator.tone}>
                        {getHealthToneLabel(indicator.tone)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {indicator.description}
                    </p>
                  </div>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-2">
                <CountDetail label="Ledger" value={unit.counts.ledgerEntries} />
                <CountDetail label="Timeline" value={unit.counts.timelineEvents} />
                <CountDetail label="Cases" value={unit.counts.maintenanceCases ?? 0} />
                <CountDetail label="Docs" value={unit.counts.documents} />
              </dl>
            </div>
          </section>

          <div className={cn(activeSection !== "photos" && "hidden")} id="unit-photos">
            <PhotoGallery
              emptyLabel="No unit photos yet."
              photos={unit.photos}
              propertyId={unit.propertyId}
              title="Unit photos"
              unitId={unit.id}
            />
          </div>

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "finance" && "hidden",
            )}
            id="unit-finance"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "lease" && "hidden",
            )}
            id="unit-lease"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "finance" && "hidden",
            )}
            id="unit-ledger"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "maintenance" && "hidden",
            )}
            id="unit-maintenance"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "timeline" && "hidden",
            )}
            id="unit-timeline"
          >
            <SectionTitle
              description={`${unit.counts.timelineEvents} active timeline records`}
              icon={<ListTree size={16} />}
              title="Timeline"
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "documents" && "hidden",
            )}
            id="unit-documents"
          >
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

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "reports" && "hidden",
            )}
            id="unit-reports"
          >
            <UnitReportsPanel unit={unit} reportMonth={reportMonth} />
          </section>

          <section
            className={cn(
              "rounded-md border border-border bg-surface",
              activeSection !== "overview" && "hidden",
            )}
            id="unit-activity"
          >
            <SectionTitle
              description={`${unit.activity.length} recent profile changes`}
              icon={<CalendarDays size={16} />}
              title="Recent activity"
            />
            {unit.activity.length === 0 ? (
              <p className="px-4 py-5 text-sm leading-6 text-muted">
                No unit profile activity has been recorded yet.
              </p>
            ) : (
              <div className="grid gap-2 p-4 lg:grid-cols-2 2xl:grid-cols-3">
                {unit.activity.slice(0, 3).map((change) => (
                  <ActivityRow change={change} key={change.id} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function UnitRecordNav({
  activeSection,
  sourceTaskId,
  unitId,
}: {
  activeSection: UnitRecordSection;
  sourceTaskId?: string;
  unitId: string;
}) {
  return (
    <nav
      aria-label="Unit record sections"
      className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2"
    >
      <div className="flex min-w-max items-center gap-1.5" role="tablist">
        {unitRecordSections.map((item) => (
          <Link
            aria-selected={activeSection === item.id}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
              activeSection === item.id && "bg-accent-soft text-foreground",
            )}
            href={buildUnitRecordHref({
              section: item.id,
              sourceTaskId,
              unitId,
            })}
            key={item.id}
            prefetch={false}
            replace
            role="tab"
            scroll={false}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function UnitReportsPanel({
  reportMonth,
  unit,
}: {
  reportMonth: string;
  unit: UnitDetail;
}) {
  return (
    <>
      <SectionTitle
        description="Unit-scoped CSV and PDF exports"
        icon={<FileText size={16} />}
        title="Reports"
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Unit report workspace</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Export the unit record as finance, leasing, maintenance, risk, or
              cleanup views while keeping each row tied back to the source record.
            </p>
            <div className="mt-3 grid gap-2 text-[12px] text-muted sm:grid-cols-3">
              <ReportMetaPill label="Scope" value={`Unit ${unit.unitNumber}`} />
              <ReportMetaPill label="Period" value={reportMonth} />
              <ReportMetaPill label="Property" value={unit.propertyCode} />
            </div>
          </div>
          <ActionLink
            href={buildUnitReportHref(unit, "unit-performance", reportMonth)}
            icon={<ExternalLink size={14} />}
            strong
          >
            Open builder
          </ActionLink>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {unitReportTemplates.map((template) => (
            <UnitReportTemplateCard
              key={template.kind}
              reportMonth={reportMonth}
              template={template}
              unit={unit}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function UnitReportTemplateCard({
  reportMonth,
  template,
  unit,
}: {
  reportMonth: string;
  template: (typeof unitReportTemplates)[number];
  unit: UnitDetail;
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
          href={buildUnitReportHref(unit, template.kind, reportMonth)}
          icon={<ExternalLink size={14} />}
        >
          Preview
        </ActionLink>
        <ActionLink
          href={buildUnitReportExportHref(unit, template.kind, reportMonth)}
          icon={<Download size={14} />}
        >
          CSV
        </ActionLink>
        <ActionLink
          href={buildUnitReportPdfHref(unit, template.kind, reportMonth)}
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

function buildUnitReportHref(
  unit: UnitDetail,
  report: ReportKind,
  month: string,
) {
  return buildUnitReportUrl("/reports", unit, report, month);
}

function buildUnitReportExportHref(
  unit: UnitDetail,
  report: ReportKind,
  month: string,
) {
  return buildUnitReportUrl("/api/reports/export", unit, report, month);
}

function buildUnitReportPdfHref(
  unit: UnitDetail,
  report: ReportKind,
  month: string,
) {
  return buildUnitReportUrl("/api/reports/pdf", unit, report, month);
}

function buildUnitReportUrl(
  pathname: string,
  unit: UnitDetail,
  report: ReportKind,
  month: string,
) {
  const params = new URLSearchParams({
    month,
    propertyId: unit.propertyId,
    report,
    unitId: unit.id,
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

function getHealthToneLabel(tone: UnitDetail["healthIndicators"][number]["tone"]) {
  if (tone === "success") {
    return "Ready";
  }

  if (tone === "danger") {
    return "Risk";
  }

  if (tone === "warning") {
    return "Review";
  }

  return "Info";
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
  const content = (
    <>
      <p className="break-words font-medium">{change.actionLabel}</p>
      <p className="mt-1 text-xs text-muted">
        {formatDate(change.createdAt)} / {change.recordLabel}
      </p>
    </>
  );

  return change.href ? (
    <Link
      className="block rounded-md border border-border bg-surface-muted/60 px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
      href={change.href}
      prefetch={false}
    >
      {content}
    </Link>
  ) : (
    <div className="rounded-md border border-border bg-surface-muted/60 px-3 py-2 text-sm">
      {content}
    </div>
  );
}
