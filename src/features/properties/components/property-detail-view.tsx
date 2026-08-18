"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  FileText,
  MapPin,
  Plus,
  Search,
  ScrollText,
  UserRound,
  Wrench,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { PhotoGallery } from "@/features/photos/components/photo-gallery";
import { PropertyUnitsTable } from "@/features/properties/components/property-units-table";
import {
  setPropertyRentalStructureAction,
  type PropertyActionState,
} from "@/features/properties/actions";
import type {
  PropertyDetail,
  PropertyDocumentContext,
  PropertyMaintenanceContext,
  PropertyWorkflowEvidenceContext,
} from "@/features/properties/data/property-detail";
import type { PropertyBadgeTone } from "@/features/properties/property.types";
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
  { id: "account", label: "Finance" },
  { id: "maintenance", label: "Maintenance" },
  { id: "files", label: "Files" },
];

const propertyNextActionToneClass: Record<PropertyBadgeTone, string> = {
  accent: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
  danger: "border-danger/35 bg-danger-soft/40 text-danger hover:bg-danger-soft/60",
  neutral: "border-border bg-background text-foreground hover:bg-muted/60",
  success: "border-success/35 bg-success-soft/40 text-success hover:bg-success-soft/60",
  warning: "border-warning/40 bg-warning-soft text-warning hover:bg-warning-soft/75",
};

export function PropertyDetailView({
  initialSection = "overview",
  onAddDocument,
  onAddUnit,
  onAssignOwner,
  onCreateLease,
  property,
}: {
  initialSection?: PropertyLocalSection;
  onAddDocument: () => void;
  onAddUnit: () => void;
  onAssignOwner: () => void;
  onCreateLease: () => void;
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
          onAssignOwner={onAssignOwner}
          onCreateLease={onCreateLease}
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
  onAssignOwner,
  onCreateLease,
  property,
}: {
  activeSection: PropertyLocalSection;
  onAddDocument: () => void;
  onAddUnit: () => void;
  onAssignOwner: () => void;
  onCreateLease: () => void;
  property: PropertyDetail;
}) {
  const content = getPropertyRecordPanelContent({
    activeSection,
    onAddDocument,
    onAddUnit,
    onAssignOwner,
    onCreateLease,
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
  onAssignOwner,
  onCreateLease,
  property,
}: {
  activeSection: PropertyLocalSection;
  onAddDocument: () => void;
  onAddUnit: () => void;
  onAssignOwner: () => void;
  onCreateLease: () => void;
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

  const needsFirstUnit =
    property.rentalStructure === "multi_unit" && property.activeUnitCount === 0;
  const needsWholePropertyLease =
    property.rentalStructure === "single_space" &&
    property.activeLeases.length === 0 &&
    !property.propertyDraftLease;
  const hasStructureNextStep =
    needsFirstUnit || needsWholePropertyLease || Boolean(property.propertyDraftLease);

  return (
    <>
      <section id="property-overview">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p className="flex min-w-0 items-center gap-1.5 text-foreground">
            <MapPin aria-hidden="true" size={14} />
            <span className="break-words">{property.address}</span>
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-foreground">
            <UserRound aria-hidden="true" size={14} />
            <span className="break-words">{property.owner}</span>
          </p>
          <Badge tone={property.statusTone}>{property.status}</Badge>
        </div>

        {property.rentalStructure === "undecided" ? (
          <PropertyRentalStructureSetup propertyId={property.id} />
        ) : null}

        {needsFirstUnit ? (
          <div className="mt-5 border-y border-border py-5">
            <h2 className="text-base font-semibold">Add the first unit</h2>
            <Button className="mt-4" onClick={onAddUnit}>
              <Building2 size={14} />
              Add first unit
            </Button>
          </div>
        ) : null}

        {needsWholePropertyLease ? (
          <div className="mt-5 border-y border-border py-5">
            <h2 className="text-base font-semibold">Create the property Lease</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This Lease belongs directly to the Property. No Unit is needed.
            </p>
            <Button className="mt-4" onClick={onCreateLease}>
              <ScrollText size={14} />
              Create lease
            </Button>
          </div>
        ) : null}

        {property.propertyDraftLease ? (
          <div className="mt-5 border-y border-border py-5">
            <h2 className="text-base font-semibold">Continue the property Lease</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A whole-property draft Lease already exists for {property.propertyDraftLease.tenantName}.
            </p>
            <Button asChild className="mt-4">
              <Link href={property.propertyDraftLease.href} prefetch={false}>
                <ScrollText size={14} />
                Continue draft lease
              </Link>
            </Button>
          </div>
        ) : null}

        {property.rentalStructure !== "undecided" && !hasStructureNextStep ? (
          <PropertyOverviewWorkspace
            onAssignOwner={onAssignOwner}
            property={property}
          />
        ) : null}
      </section>

      {property.activity.length > 0 ? (
        <PropertyOverviewActivity
          activity={property.activity}
          timelineHref={property.hrefs.timeline}
        />
      ) : null}
    </>
  );
}

function PropertyOverviewWorkspace({
  onAssignOwner,
  property,
}: {
  onAssignOwner: () => void;
  property: PropertyDetail;
}) {
  const activeLeaseLabel =
    property.activeLeases.length === 1
      ? property.activeLeases[0]!.tenantName
      : property.activeLeases.length > 1
        ? `${property.activeLeases.length} active`
        : "No active lease";

  return (
    <>
      <dl
        aria-label="Property summary"
        className="mt-5 grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-muted/25 text-sm sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-y-0"
      >
        <Detail label="Occupancy" value={property.unitSummary} />
        <Detail label="Active lease" value={activeLeaseLabel} />
        <Detail label="Monthly rent" moneyValue={property.monthlyRentDisplay} />
        <Detail
          label={`NOI / ${property.financialSummary.periodLabel}`}
          moneyValue={property.financialSummary.noiDisplay}
        />
      </dl>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,2.45fr)_minmax(300px,0.9fr)] 2xl:items-stretch">
        <PropertyOverviewUnits property={property} />
        <PropertyOverviewCard onAssignOwner={onAssignOwner} property={property} />
      </div>
    </>
  );
}

type PropertyOverviewRow = {
  actionLabel: string;
  href: string;
  id: string;
  leaseDates: string;
  rentDisplay?: MoneyDisplayValue;
  rentLabel: string;
  scopeLabel: string;
  statusLabel: string;
  tenantLabel: string;
};

type PropertyOverviewFilter = "all" | "occupied" | "vacant" | "unleased";

const propertyOverviewFilterOptions = [
  { label: "All records", value: "all" },
  { label: "Occupied / active", value: "occupied" },
  { label: "Vacant", value: "vacant" },
  { label: "No active lease", value: "unleased" },
];

function PropertyOverviewUnits({ property }: { property: PropertyDetail }) {
  const [filter, setFilter] = useState<PropertyOverviewFilter>("all");
  const [query, setQuery] = useState("");
  const activeUnits = property.unitsList.filter((unit) => !unit.isArchived);
  const rows: PropertyOverviewRow[] =
    property.rentalStructure === "single_space"
      ? property.activeLeases.map((lease) => ({
          actionLabel: "View details",
          href: lease.href,
          id: lease.id,
          leaseDates: lease.termLabel,
          rentDisplay: lease.rentDisplay,
          rentLabel: lease.rentLabel,
          scopeLabel: "Whole property",
          statusLabel: lease.statusLabel,
          tenantLabel: lease.tenantName,
        }))
      : activeUnits.map((unit) => {
          const lease = property.activeLeases.find(
            (candidate) => candidate.unitHref === `/units/${unit.id}`,
          );

          return {
            actionLabel: "View details",
            href: `/units/${unit.id}`,
            id: unit.id,
            leaseDates: lease?.termLabel ?? unit.leaseEndLabel,
            rentDisplay: lease?.rentDisplay ?? unit.monthlyRentDisplay,
            rentLabel: lease?.rentLabel ?? unit.monthlyRent,
            scopeLabel: unit.unitNumber,
            statusLabel: unit.occupancy,
            tenantLabel: lease?.tenantName ?? unit.tenantName ?? "No active lease",
          };
        });
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const status = row.statusLabel.trim().toLowerCase();
    const matchesQuery =
      normalizedQuery.length === 0 ||
      row.scopeLabel.toLowerCase().includes(normalizedQuery) ||
      row.tenantLabel.toLowerCase().includes(normalizedQuery);

    if (filter === "occupied") {
      return matchesQuery && (status === "occupied" || status === "active");
    }
    if (filter === "vacant") {
      return matchesQuery && status === "vacant";
    }
    if (filter === "unleased") {
      return matchesQuery && row.tenantLabel === "No active lease";
    }
    return matchesQuery;
  });
  return (
    <section
      aria-labelledby="property-overview-units-title"
      className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_14px_34px_-28px_rgba(15,23,42,0.55)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold" id="property-overview-units-title">
          Units and leases
        </h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-[190px] sm:flex-none">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <Input
              aria-label="Search unit number or tenant"
              className="h-8 rounded-md pl-8 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search unit or tenant"
              type="search"
              value={query}
            />
          </div>
          <SelectControl
            ariaLabel="Filter units and leases"
            className="h-8 w-[148px] text-xs"
            onValueChange={(value) => setFilter(value as PropertyOverviewFilter)}
            options={propertyOverviewFilterOptions}
            value={filter}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-start p-4">
          <EmptyBlock
            actionHref={property.nextAction.href}
            actionLabel={property.nextAction.label}
            label="No active unit or lease record is available yet."
          />
        </div>
      ) : (
        <>
          <div className="space-y-3 p-4 md:hidden">
            {filteredRows.map((row) => (
              <Link
                className="block rounded-md border border-border bg-muted/20 p-4 text-sm transition-colors hover:bg-warning-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={row.href}
                key={row.id}
                prefetch={false}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{row.scopeLabel}</p>
                    <p className="mt-1 break-words text-muted-foreground">
                      {row.tenantLabel}
                    </p>
                  </div>
                  <Badge tone={getOverviewStatusTone(row.statusLabel)}>
                    {row.statusLabel}
                  </Badge>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">{row.leaseDates}</p>
                  {row.rentDisplay ? (
                    <MoneyDisplay align="right" value={row.rentDisplay} />
                  ) : (
                    <span className="font-medium">{row.rentLabel}</span>
                  )}
                </div>
              </Link>
            ))}
            {filteredRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No records match this view.
              </p>
            ) : null}
          </div>

          <div className="hidden flex-1 overflow-x-auto md:block">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[13%]" />
                <col className="w-[18%]" />
                <col className="w-[25%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-[var(--table-header-bg)] text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-2 py-3 font-medium">Status</th>
                  <th className="px-2 py-3 font-medium">Tenant / lease</th>
                  <th className="px-2 py-3 font-medium">Lease dates</th>
                  <th className="px-2 py-3 text-right font-medium">Monthly rent</th>
                  <th className="px-4 py-3 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    className="border-t border-border bg-warning-soft/10 transition-colors hover:bg-warning-soft/25"
                    key={row.id}
                  >
                    <td className="px-4 py-4 font-semibold text-foreground">
                      {row.scopeLabel}
                    </td>
                    <td className="px-2 py-4">
                      <Badge tone={getOverviewStatusTone(row.statusLabel)}>
                        {row.statusLabel}
                      </Badge>
                    </td>
                    <td className="px-2 py-4 font-medium">{row.tenantLabel}</td>
                    <td className="whitespace-nowrap px-2 py-4 text-muted-foreground">
                      {row.leaseDates}
                    </td>
                    <td className="px-2 py-4">
                      {row.rentDisplay ? (
                        <MoneyDisplay align="right" value={row.rentDisplay} />
                      ) : (
                        <span className="block text-right font-medium">
                          {row.rentLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        href={row.href}
                        prefetch={false}
                      >
                        {row.actionLabel}
                        <ArrowRight aria-hidden="true" size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr className="border-t border-border">
                    <td
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                      colSpan={6}
                    >
                      No records match this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function PropertyOverviewCard({
  onAssignOwner,
  property,
}: {
  onAssignOwner: () => void;
  property: PropertyDetail;
}) {
  const coverPhoto =
    property.photos.find((photo) => photo.isCover && photo.url) ??
    property.photos.find((photo) => photo.url);
  const attention =
    property.healthIndicators.find(
      (indicator) =>
        indicator.id === "noi" &&
        (indicator.tone === "warning" || indicator.tone === "danger"),
    ) ??
    property.healthIndicators.find(
      (indicator) =>
        indicator.id !== "evidence" &&
        (indicator.tone === "warning" || indicator.tone === "danger"),
    );
  const ownerInitial = property.owner.trim().charAt(0).toUpperCase() || "?";
  const ownerContent = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-9">
        <AvatarFallback className="bg-warning-soft text-warning">
          {ownerInitial}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{property.owner}</p>
        <p className="text-xs text-muted-foreground">Primary owner</p>
      </div>
    </div>
  );

  return (
    <aside
      aria-label="Property details"
      className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_14px_34px_-28px_rgba(15,23,42,0.55)]"
    >
      <div className="relative aspect-[3/2] shrink-0 overflow-hidden bg-muted/45">
        <Image
          alt={coverPhoto?.caption || coverPhoto?.fileName || `${property.name} property`}
          className="object-contain transition-transform duration-300 hover:scale-[1.01]"
          fill
          sizes="(min-width: 1280px) 30vw, 100vw"
          src={coverPhoto?.url ?? "/property-overview-default-cover.png"}
          unoptimized={Boolean(coverPhoto?.url)}
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{property.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Building2 aria-hidden="true" size={13} />
              {property.type}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" size={13} />
              {property.address}
            </span>
          </div>
        </div>

        <div className="mt-4">
          {property.hrefs.ownerPerson ? (
            <Link
              className="block rounded-md outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring"
              href={property.hrefs.ownerPerson}
              prefetch={false}
            >
              {ownerContent}
            </Link>
          ) : (
            <button
              className="block w-full rounded-md text-left outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onAssignOwner}
              type="button"
            >
              {ownerContent}
            </button>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
          {attention ? (
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle
                aria-hidden="true"
                className={attention.tone === "danger" ? "text-danger" : "text-warning"}
                size={14}
              />
              <span className="truncate">{attention.label}</span>
            </p>
          ) : null}
          <PropertyOverviewAction
            action={property.nextAction}
            onAssignOwner={onAssignOwner}
          />
        </div>
      </div>
    </aside>
  );
}

function PropertyOverviewAction({
  action,
  onAssignOwner,
}: {
  action: PropertyDetail["nextAction"];
  onAssignOwner: () => void;
}) {
  const className = cn(
    "h-7 rounded-md border px-2.5 text-xs font-semibold shadow-none transition-colors",
    propertyNextActionToneClass[action.tone],
  );

  if (action.intent === "assign-owner") {
    return (
      <button className={className} onClick={onAssignOwner} type="button">
        {action.label}
      </button>
    );
  }

  return (
    <Link className={cn(className, "inline-flex items-center")} href={action.href} prefetch={false}>
      {action.label}
    </Link>
  );
}

function PropertyOverviewActivity({
  activity,
  timelineHref,
}: {
  activity: RecentChange[];
  timelineHref: string;
}) {
  return (
    <section className="mt-6" id="property-activity">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <h2 className="text-base font-semibold">Recent activity</h2>
        <div className="flex items-center gap-3 text-xs">
          <p className="text-muted-foreground">
            {activity.length} recent profile changes
          </p>
          <Link
            aria-label="View all property activity"
            className="inline-flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={timelineHref}
            prefetch={false}
          >
            View all
            <ArrowRight aria-hidden="true" size={13} />
          </Link>
        </div>
      </div>
      <div className="hidden md:block">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 px-3 py-2 text-xs text-muted-foreground">
          <span>Activity</span>
          <span>Scope</span>
          <span>Date</span>
        </div>
        <div className="divide-y divide-border">
          {activity.slice(0, 3).map((change) => {
            const content = (
              <>
                <span className="min-w-0 truncate font-medium text-foreground">
                  {change.actionLabel}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {change.recordLabel}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(change.createdAt)}
                </span>
              </>
            );

            return change.href ? (
              <Link
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 px-3 py-2.5 text-sm transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={change.href}
                key={change.id}
                prefetch={false}
              >
                {content}
              </Link>
            ) : (
              <div
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 px-3 py-2.5 text-sm"
                key={change.id}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-border md:hidden">
        {activity.slice(0, 3).map((change) => (
          <ActivityRow change={change} key={change.id} />
        ))}
      </div>
    </section>
  );
}

function getOverviewStatusTone(status: string): PropertyBadgeTone {
  const normalized = status.toLowerCase();

  if (normalized === "occupied" || normalized === "active") return "success";
  if (normalized === "vacant") return "neutral";
  return "warning";
}

const initialRentalStructureState: PropertyActionState = {};

function PropertyRentalStructureSetup({ propertyId }: { propertyId: string }) {
  const [state, action, pending] = useActionState(
    setPropertyRentalStructureAction,
    initialRentalStructureState,
  );

  return (
    <form
      action={action}
      className="mt-5 border-y border-border py-5"
    >
      <input name="propertyId" type="hidden" value={propertyId} />
      <h2 className="text-base font-semibold">Rental structure</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pending}
          name="rentalStructure"
          type="submit"
          value="single_space"
        >
          The whole property
        </Button>
        <Button
          disabled={pending}
          name="rentalStructure"
          type="submit"
          value="multi_unit"
          variant="outline"
        >
          Separate units
        </Button>
      </div>
      {state.message ? (
        <p
          className={cn(
            "mt-3 text-sm",
            state.status === "error" ? "text-danger" : "text-success",
          )}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
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
    <div className="min-w-0 px-4 py-4">
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
