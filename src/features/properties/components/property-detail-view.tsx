"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  Plus,
  ScrollText,
  UserRound,
  Wrench,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/features/photos/components/photo-gallery";
import { PropertyUnitsTable } from "@/features/properties/components/property-units-table";
import type {
  PropertyDetail,
  PropertyDetailLease,
  PropertyDocumentContext,
  PropertyMaintenanceContext,
  PropertyOwnerHistory,
  PropertyWorkflowEvidenceContext,
} from "@/features/properties/data/property-detail";
import type { RecentChange } from "@/features/activity/activity.types";
import {
  buildReportBuilderHref,
  type CurrentReportKind,
} from "@/features/reports/report-catalog";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

export type PropertyRecordSection =
  | "overview"
  | "units"
  | "account"
  | "maintenance"
  | "files";

type PropertyLocalSection = Exclude<PropertyRecordSection, "account">;

const propertyRecordSections: Array<{
  id: PropertyRecordSection;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "units", label: "Units" },
  { id: "account", label: "Account" },
  { id: "maintenance", label: "Maintenance" },
  { id: "files", label: "Files" },
];

export function PropertyDetailView({
  initialSection = "overview",
  onAddDocument,
  onAddUnit,
  property,
}: {
  initialSection?: PropertyLocalSection;
  onAddDocument: () => void;
  onAddUnit: () => void;
  property: PropertyDetail;
}) {
  const [activeSection, setActiveSection] =
    useState<PropertyLocalSection>(initialSection);

  return (
    <div
      className="workspace-gutter-x flex flex-col gap-5 px-4 py-4 sm:px-6 lg:flex-1 2xl:px-8"
      data-slot="property-record-workspace"
    >
      <PropertyRecordNavigation
        activeSection={activeSection}
        accountHref={property.hrefs.account}
        openMaintenanceCount={property.counts.openMaintenanceCases}
        onSectionChange={setActiveSection}
        propertyId={property.id}
      />

      <div className="flex-1">
        <PropertyRecordPanel
          activeSection={activeSection}
          onAddDocument={onAddDocument}
          onAddUnit={onAddUnit}
          property={property}
        />
      </div>
    </div>
  );
}

function PropertyRecordPanel({
  activeSection,
  onAddDocument,
  onAddUnit,
  property,
}: {
  activeSection: PropertyLocalSection;
  onAddDocument: () => void;
  onAddUnit: () => void;
  property: PropertyDetail;
}) {
  const content = getPropertyRecordPanelContent({
    activeSection,
    onAddDocument,
    onAddUnit,
    property,
  });

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
  onAddDocument,
  onAddUnit,
  property,
}: {
  activeSection: PropertyLocalSection;
  onAddDocument: () => void;
  onAddUnit: () => void;
  property: PropertyDetail;
}) {
  if (activeSection === "units") {
    return (
      <section id="property-units">
        <SectionTitle
          actions={
            <Button onClick={onAddUnit} size="sm" variant="outline">
              <Building2 size={14} />
              Add unit
            </Button>
          }
          icon={<Building2 size={16} />}
          title="Units"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 text-sm">
          <p className="font-medium">
            {formatUnitOperationalSummary(property)}
          </p>
          <p className="flex items-baseline gap-1.5 text-muted-foreground">
            <MoneyDisplay value={property.monthlyRentDisplay} />
            <span className="text-xs">monthly rent</span>
          </p>
        </div>
        <div className="pt-4">
          {property.unitsList.length === 0 ? (
            <EmptyBlock
              actionLabel="Add unit"
              label="Property-only record. There are no units attached."
              onAction={onAddUnit}
            />
          ) : (
            <PropertyUnitsTable units={property.unitsList} />
          )}
        </div>
      </section>
    );
  }

  if (activeSection === "maintenance") {
    return (
      <section id="property-maintenance">
        <SectionTitle
          actions={
            <>
              <span className="text-xs text-muted-foreground">
                {property.counts.openMaintenanceCases ?? 0} open · {property.counts.overdueMaintenanceCases ?? 0} overdue
              </span>
              <ActionLink
                href={property.hrefs.addMaintenanceCase}
                icon={<Plus size={14} />}
              >
                New case
              </ActionLink>
            </>
          }
          icon={<Wrench size={16} />}
          title="Maintenance"
        />
        <div className="divide-y divide-border">
          {property.recentMaintenanceCases.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No maintenance cases yet.
            </p>
          ) : null}
          {property.recentMaintenanceCases.map((maintenanceCase) => (
            <MaintenanceRow key={maintenanceCase.id} maintenanceCase={maintenanceCase} />
          ))}
        </div>
      </section>
    );
  }

  if (activeSection === "files") {
    return (
      <>
        <PhotoGallery
          emptyLabel="No property or unit photos yet."
          photos={property.photos}
          propertyId={property.id}
          title="Photos"
          uploadLabel="Add property photo"
        />
        <section id="property-documents">
          <SectionTitle
            actions={
              <Button onClick={onAddDocument} size="sm" variant="outline">
                <FileText size={14} />
                Add property document
              </Button>
            }
            icon={<FileText size={16} />}
            title="Property documents"
          />
          <div className="divide-y divide-border">
            {property.propertyDocuments.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">No property documents yet.</p>
            ) : null}
            {property.propertyDocuments.map((document) => (
              <DocumentRow document={document} key={document.id} />
            ))}
          </div>
        </section>
        <section id="property-workflow-evidence">
          <SectionTitle
            icon={<ScrollText size={16} />}
            title="Workflow evidence"
          />
          <div className="divide-y divide-border">
            {property.workflowEvidence.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">No workflow evidence yet.</p>
            ) : null}
            {property.workflowEvidence.map((evidence) => (
              <WorkflowEvidenceRow evidence={evidence} key={evidence.id} />
            ))}
          </div>
        </section>
      </>
    );
  }

  const actionableHealthIndicators = property.healthIndicators.filter(
    (indicator) => indicator.tone === "warning" || indicator.tone === "danger",
  );

  return (
    <>
      <section id="property-overview">
        <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
          <p className="break-words text-foreground">{property.address}</p>
          <span className="hidden text-border sm:inline" aria-hidden="true">
            /
          </span>
          <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <UserRound aria-hidden="true" size={14} />
            <span className="break-words">{property.owner}</span>
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <Link
            aria-label={property.nextAction.label}
            className={cn(
              "flex min-w-0 items-start gap-3 border-l-2 px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              property.nextAction.tone === "danger" &&
                "border-danger bg-danger-soft/35 hover:bg-danger-soft/55",
              property.nextAction.tone === "warning" &&
                "border-warning bg-warning-soft/35 hover:bg-warning-soft/55",
              property.nextAction.tone === "success" &&
                "border-success bg-success-soft/35 hover:bg-success-soft/55",
            )}
            href={property.nextAction.href}
            prefetch={false}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {property.nextAction.label}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {property.nextAction.description}
              </p>
            </div>
            <ArrowRight aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
          </Link>

          {actionableHealthIndicators.length > 0 ? (
            <ul
              aria-label="Property alerts"
              className="divide-y divide-border border-y border-border"
            >
              {actionableHealthIndicators.map((indicator) => (
                <li className="flex items-start gap-3 py-2 text-xs" key={indicator.id}>
                  <AlertTriangle
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 shrink-0",
                      indicator.tone === "danger" ? "text-danger" : "text-warning",
                    )}
                    size={14}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{indicator.label}</p>
                    <p className="mt-0.5 leading-5 text-muted-foreground">
                      {indicator.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <dl
          aria-label="Property summary"
          className="mt-4 grid grid-cols-1 divide-y divide-border border-y border-border py-3 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <Detail label="Occupancy" value={property.unitSummary} />
          <Detail label="Active leases" value={String(property.counts.activeLeases)} />
          <Detail
            label={`NOI / ${property.financialSummary.periodLabel}`}
            moneyValue={property.financialSummary.noiDisplay}
          />
        </dl>
      </section>

      <section id="property-ownership">
        <SectionTitle
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

export function PropertyRecordNavigation({
  accountHref,
  activeSection,
  openMaintenanceCount = 0,
  onSectionChange,
  propertyId,
}: {
  accountHref?: string;
  activeSection: PropertyRecordSection;
  openMaintenanceCount?: number;
  onSectionChange?: (section: PropertyLocalSection) => void;
  propertyId: string;
}) {
  return (
    <nav
      aria-label="Property record sections"
      className="overflow-x-auto border-b border-border"
    >
      <div className="flex min-w-max items-center gap-1" role="tablist">
        {propertyRecordSections.map((item) => {
          const href =
            item.id === "account"
              ? accountHref ?? `/properties/${propertyId}/account`
              : item.id === "overview"
                ? `/properties/${propertyId}`
                : `/properties/${propertyId}?section=${item.id}`;
          const className = cn(
            "inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            activeSection === item.id && "border-primary text-foreground",
          );
          const label = (
            <>
              {item.label}
              {item.id === "maintenance" && openMaintenanceCount > 0 ? (
                <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] leading-none text-warning">
                  {openMaintenanceCount} open
                </span>
              ) : null}
            </>
          );

          if (item.id === "account" || !onSectionChange) {
            return (
              <Link
                aria-selected={activeSection === item.id}
                className={className}
                href={href}
                id={`property-tab-${item.id}`}
                key={item.id}
                prefetch={false}
                role="tab"
              >
                {label}
              </Link>
            );
          }

          return (
            <button
              aria-controls={
                activeSection === item.id ? `property-panel-${item.id}` : undefined
              }
              aria-selected={activeSection === item.id}
              className={className}
              id={`property-tab-${item.id}`}
              key={item.id}
              onClick={() => {
                onSectionChange(item.id as PropertyLocalSection);
                window.history.pushState(null, "", href);
              }}
              role="tab"
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
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

function formatUnitOperationalSummary(property: PropertyDetail) {
  const activeUnits = property.unitsList.filter((unit) => !unit.isArchived);
  const occupiedUnits = activeUnits.filter(
    (unit) => unit.occupancy.toLowerCase() === "occupied",
  ).length;
  const vacantUnits = activeUnits.filter(
    (unit) => unit.occupancy.toLowerCase() === "vacant",
  ).length;

  return `${activeUnits.length} ${activeUnits.length === 1 ? "unit" : "units"} · ${occupiedUnits} occupied · ${vacantUnits} vacant`;
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
  label,
  moneyValue,
  value,
}: {
  label: string;
  moneyValue?: MoneyDisplayValue;
  value?: string;
}) {
  return (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0 sm:px-4 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-lg font-semibold">
        {moneyValue ? <MoneyDisplay value={moneyValue} /> : value}
      </dd>
    </div>
  );
}

function SectionTitle({
  actions,
  description,
  icon,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function EmptyBlock({
  actionHref,
  actionLabel,
  label,
  onAction,
}: {
  actionHref?: string;
  actionLabel: string;
  label: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/60 p-3 text-sm">
      <p className="text-muted-foreground">{label}</p>
      {onAction ? (
        <Button className="mt-3" onClick={onAction} size="sm" variant="outline">
          <FileText size={14} />
          {actionLabel}
        </Button>
      ) : actionHref ? (
        <ActionLink className="mt-3" href={actionHref} icon={<FileText size={14} />}>
          {actionLabel}
        </ActionLink>
      ) : null}
    </div>
  );
}

function OwnerRow({ owner }: { owner: PropertyOwnerHistory }) {
  return (
    <Link
      className="block px-3 py-2.5 text-sm transition-colors hover:bg-muted"
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
      className="block px-3 py-2.5 text-sm transition-colors hover:bg-muted"
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

function WorkflowEvidenceRow({
  evidence,
}: {
  evidence: PropertyWorkflowEvidenceContext;
}) {
  const content = (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <p className="break-words font-medium">{evidence.sourceLabel}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {[evidence.fileName, evidence.vendorLabel, formatDate(evidence.uploadedAt)]
            .filter(Boolean)
            .join(" / ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {evidence.statusLabel ? (
          <Badge tone={evidence.statusTone}>{evidence.statusLabel}</Badge>
        ) : null}
        {evidence.amountDisplay ? (
          <MoneyDisplay align="right" value={evidence.amountDisplay} />
        ) : null}
      </div>
    </div>
  );

  return evidence.href ? (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={evidence.href}
      prefetch={false}
    >
      {content}
    </Link>
  ) : (
    <div className="px-4 py-3 text-sm">{content}</div>
  );
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
