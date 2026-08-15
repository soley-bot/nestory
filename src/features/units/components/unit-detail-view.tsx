"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ExternalLink, FileText, Plus, ScrollText, UserRound } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/features/photos/components/photo-gallery";
import {
  buildUnitRecordHref,
  type UnitRecordSection,
} from "@/features/units/unit-detail-route";
import type {
  UnitDetail,
  UnitDocumentContext,
  UnitLedgerContext,
  UnitMaintenanceContext,
} from "@/features/units/unit.types";
import type { RecentChange } from "@/features/activity/activity.types";
import { buildReportBuilderHref } from "@/features/reports/report-catalog";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const unitRecordSections: Array<{
  id: UnitRecordSection;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "lease", label: "Lease" },
  { id: "finance", label: "Finance" },
  { id: "maintenance", label: "Maintenance" },
  { id: "files", label: "Files" },
];

export function UnitDetailView({
  initialSection = "overview",
  onAddDocument,
  onNewMaintenanceCase,
  onOpenLease,
  onOpenLedgerEntry,
  onOpenMaintenanceCase,
  sourceTaskId,
  unit,
}: {
  initialSection?: UnitRecordSection;
  onAddDocument: () => void;
  onNewMaintenanceCase: () => void;
  onOpenLease: () => void;
  onOpenLedgerEntry: (entry: UnitLedgerContext) => void;
  onOpenMaintenanceCase: (maintenanceCase: UnitMaintenanceContext) => void;
  sourceTaskId?: string;
  unit: UnitDetail;
}) {
  const [activeSection, setActiveSection] =
    useState<UnitRecordSection>(initialSection);

  return (
    <div
      className="workspace-gutter-x flex flex-col gap-5 px-4 py-4 sm:px-6 lg:flex-1 2xl:px-8"
      data-slot="unit-record-workspace"
    >
      <UnitRecordNavigation
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        openMaintenanceCount={unit.counts.openMaintenanceCases ?? 0}
        sourceTaskId={sourceTaskId}
        unitId={unit.id}
      />

      <div className="flex-1">
        <UnitRecordPanel
          activeSection={activeSection}
          onAddDocument={onAddDocument}
          onNewMaintenanceCase={onNewMaintenanceCase}
          onOpenLease={onOpenLease}
          onOpenLedgerEntry={onOpenLedgerEntry}
          onOpenMaintenanceCase={onOpenMaintenanceCase}
          unit={unit}
        />
      </div>
    </div>
  );
}

function UnitRecordPanel({
  activeSection,
  onAddDocument,
  onNewMaintenanceCase,
  onOpenLease,
  onOpenLedgerEntry,
  onOpenMaintenanceCase,
  unit,
}: {
  activeSection: UnitRecordSection;
  onAddDocument: () => void;
  onNewMaintenanceCase: () => void;
  onOpenLease: () => void;
  onOpenLedgerEntry: (entry: UnitLedgerContext) => void;
  onOpenMaintenanceCase: (maintenanceCase: UnitMaintenanceContext) => void;
  unit: UnitDetail;
}) {
  return (
    <div
      aria-labelledby={`unit-tab-${activeSection}`}
      className="space-y-6"
      id={`unit-panel-${activeSection}`}
      role="tabpanel"
    >
      {getUnitRecordPanelContent({
        activeSection,
        onAddDocument,
        onNewMaintenanceCase,
        onOpenLease,
        onOpenLedgerEntry,
        onOpenMaintenanceCase,
        unit,
      })}
    </div>
  );
}

function getUnitRecordPanelContent({
  activeSection,
  onAddDocument,
  onNewMaintenanceCase,
  onOpenLease,
  onOpenLedgerEntry,
  onOpenMaintenanceCase,
  unit,
}: {
  activeSection: UnitRecordSection;
  onAddDocument: () => void;
  onNewMaintenanceCase: () => void;
  onOpenLease: () => void;
  onOpenLedgerEntry: (entry: UnitLedgerContext) => void;
  onOpenMaintenanceCase: (maintenanceCase: UnitMaintenanceContext) => void;
  unit: UnitDetail;
}) {
  if (activeSection === "lease") {
    return <UnitLeasePanel onOpenLease={onOpenLease} unit={unit} />;
  }

  if (activeSection === "finance") {
    return <UnitFinancePanel onOpenLedgerEntry={onOpenLedgerEntry} unit={unit} />;
  }

  if (activeSection === "maintenance") {
    return (
      <UnitMaintenancePanel
        onNewMaintenanceCase={onNewMaintenanceCase}
        onOpenMaintenanceCase={onOpenMaintenanceCase}
        unit={unit}
      />
    );
  }

  if (activeSection === "files") {
    return <UnitFilesPanel onAddDocument={onAddDocument} unit={unit} />;
  }

  return <UnitOverviewPanel unit={unit} />;
}

function UnitOverviewPanel({ unit }: { unit: UnitDetail }) {
  const openChecks = unit.healthIndicators.filter(
    (indicator) => indicator.tone !== "success",
  );

  return (
    <>
      <section id="unit-overview">
        <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
          <Link className="font-medium hover:underline" href={unit.hrefs.property}>
            {unit.propertyName}
          </Link>
          <span className="hidden text-border sm:inline" aria-hidden="true">
            /
          </span>
          <p className="text-muted-foreground">
            Floor {unit.floorLabel} · {unit.sizeLabel}
          </p>
          {unit.activeLease ? (
            <>
              <span className="hidden text-border sm:inline" aria-hidden="true">
                /
              </span>
              <p className="text-muted-foreground">
                Lease ends {formatDate(unit.activeLease.endDate)}
              </p>
            </>
          ) : null}
        </div>

        <dl
          aria-label="Unit summary"
          className="mt-4 grid grid-cols-1 divide-y divide-border border-y border-border py-3 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          role="group"
        >
          <Detail
            label="Tenant"
            value={unit.activeLease?.tenantName ?? "No active tenant"}
          />
          <Detail
            label="Monthly rent"
            moneyValue={unit.rentDisplay}
            value={unit.rentLabel}
          />
          <Detail label="Ledger net" moneyValue={unit.ledgerNetDisplay} />
        </dl>
      </section>

      {openChecks.length > 0 ? (
        <section aria-label="Unit attention" id="unit-attention">
          <SectionTitle
            actions={
              <span className="text-xs text-muted-foreground">
                {openChecks.length} {openChecks.length === 1 ? "item" : "items"}
              </span>
            }
            title="Attention"
          />
          <div className="divide-y divide-border">
            {openChecks.map((indicator) => (
              <div
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                key={indicator.id}
              >
                <div className="min-w-0">
                  <p className="font-medium">{indicator.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {indicator.description}
                  </p>
                </div>
                <Badge tone={indicator.tone}>{getHealthToneLabel(indicator.tone)}</Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {unit.activity.length > 0 ? (
        <section id="unit-activity">
          <SectionTitle title="Recent changes" />
          <div className="divide-y divide-border">
            {unit.activity.slice(0, 3).map((change) => (
              <ActivityRow change={change} key={change.id} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function UnitLeasePanel({
  onOpenLease,
  unit,
}: {
  onOpenLease: () => void;
  unit: UnitDetail;
}) {
  if (!unit.activeLease) {
    if (unit.draftLease) {
      return (
        <section id="unit-lease">
          <SectionTitle title="Lease" />
          <p className="py-3 text-sm text-muted-foreground">
            This draft does not establish occupancy. Use the Continue draft action above.
          </p>
          <dl className="grid grid-cols-1 divide-y divide-border border-y border-border py-3 text-sm sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <Detail label="Tenant" value={unit.draftLease.tenantName} />
            <Detail label="Status" value={unit.draftLease.statusLabel} />
            <Detail
              label="Lease dates"
              value={`${formatDate(unit.draftLease.startDate)} – ${formatDate(
                unit.draftLease.endDate,
              )}`}
            />
            <Detail
              label="Monthly rent"
              moneyValue={unit.draftLease.monthlyRentDisplay}
            />
          </dl>
        </section>
      );
    }

    const explanation =
      unit.readiness.operational === "maintenance"
        ? "This Unit is in maintenance. Complete the operational work before leasing."
        : unit.readiness.operational === "inactive"
          ? "This Unit is inactive. Return it to an available operational state before leasing."
          : "No current or draft Lease is linked. Use the Create draft lease action above.";

    return (
      <section id="unit-lease">
        <SectionTitle title="Lease" />
        <p className="py-6 text-sm text-muted-foreground">{explanation}</p>
      </section>
    );
  }

  return (
    <section id="unit-lease">
      <SectionTitle
        actions={
          unit.hrefs.lease ? (
            <ActionButton icon={<ScrollText size={14} />} onClick={onOpenLease}>
              Open lease
            </ActionButton>
          ) : null
        }
        title="Lease"
      />
      <dl className="grid grid-cols-1 divide-y divide-border border-b border-border py-3 text-sm sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <Detail label="Tenant" value={unit.activeLease.tenantName} />
        <Detail label="Status" value={unit.activeLease.statusLabel} />
        <Detail
          label="Lease dates"
          value={`${formatDate(unit.activeLease.startDate)} – ${formatDate(
            unit.activeLease.endDate,
          )}`}
        />
        <Detail label="Monthly rent" moneyValue={unit.activeLease.monthlyRentDisplay} />
      </dl>

      {unit.tenantLinks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <span className="text-sm text-muted-foreground">People</span>
          {unit.tenantLinks.map((person) => (
            <Link
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-sm font-medium hover:bg-muted"
              href={person.href}
              key={person.id}
            >
              <UserRound size={14} />
              {person.displayName}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function UnitFinancePanel({
  onOpenLedgerEntry,
  unit,
}: {
  onOpenLedgerEntry: (entry: UnitLedgerContext) => void;
  unit: UnitDetail;
}) {
  const reportMonth = getBusinessMonthValue();

  return (
    <>
      <section id="unit-finance">
        <SectionTitle
          actions={
            <Link
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"
              href={buildUnitProfitLossHref(unit, reportMonth)}
              prefetch={false}
            >
              Unit income statement
              <ExternalLink size={14} />
            </Link>
          }
          description={unit.financialSummary.periodLabel}
          title="Performance"
        />
        <dl className="grid grid-cols-1 divide-y divide-border border-b border-border py-3 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Metric
            label="Revenue"
            tone="success"
            value={unit.financialSummary.incomeDisplay}
          />
          <Metric
            label="Expenses"
            tone="danger"
            value={unit.financialSummary.expenseDisplay}
          />
          <Metric
            label="NOI"
            note={unit.financialSummary.marginLabel}
            tone={unit.financialSummary.noiUsd >= 0 ? "success" : "danger"}
            value={unit.financialSummary.noiDisplay}
          />
        </dl>
      </section>

      <section id="unit-ledger">
        <SectionTitle title="Recent ledger activity" />
        <div className="divide-y divide-border">
          {unit.recentLedgerEntries.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No ledger activity.</p>
          ) : null}
          {unit.recentLedgerEntries.map((entry) => (
            <LedgerRow
              entry={entry}
              key={entry.id}
              onOpen={() => onOpenLedgerEntry(entry)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function UnitMaintenancePanel({
  onNewMaintenanceCase,
  onOpenMaintenanceCase,
  unit,
}: {
  onNewMaintenanceCase: () => void;
  onOpenMaintenanceCase: (maintenanceCase: UnitMaintenanceContext) => void;
  unit: UnitDetail;
}) {
  return (
    <section id="unit-maintenance">
      <SectionTitle
        actions={
          <>
            <span className="text-xs text-muted-foreground">
              {unit.counts.openMaintenanceCases ?? 0} open · {unit.counts.overdueMaintenanceCases ?? 0} overdue
            </span>
            <ActionButton icon={<Plus size={14} />} onClick={onNewMaintenanceCase}>
              New case
            </ActionButton>
          </>
        }
        title="Maintenance"
      />
      <div className="divide-y divide-border">
        {unit.recentMaintenanceCases.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No maintenance cases.</p>
        ) : null}
        {unit.recentMaintenanceCases.map((maintenanceCase) => (
          <MaintenanceRow
            maintenanceCase={maintenanceCase}
            key={maintenanceCase.id}
            onOpen={() => onOpenMaintenanceCase(maintenanceCase)}
          />
        ))}
      </div>
    </section>
  );
}

function UnitFilesPanel({
  onAddDocument,
  unit,
}: {
  onAddDocument: () => void;
  unit: UnitDetail;
}) {
  return (
    <>
      <PhotoGallery
        emptyLabel="No unit photos yet."
        photos={unit.photos}
        propertyId={unit.propertyId}
        title="Photos"
        unitId={unit.id}
        uploadLabel="Add unit photo"
      />
      <section id="unit-documents">
        <SectionTitle
          actions={
            <Button onClick={onAddDocument} size="sm" variant="outline">
              <FileText size={14} />
              Add unit document
            </Button>
          }
          title="Unit documents"
        />
        <div className="divide-y divide-border">
          {unit.documents.length === 0 ? (
            <p className="py-5 text-sm text-muted-foreground">No unit documents yet.</p>
          ) : null}
          {unit.documents.map((document) => (
            <DocumentRow document={document} key={document.id} />
          ))}
        </div>
      </section>
    </>
  );
}

function UnitRecordNavigation({
  activeSection,
  onSectionChange,
  openMaintenanceCount,
  sourceTaskId,
  unitId,
}: {
  activeSection: UnitRecordSection;
  onSectionChange: (section: UnitRecordSection) => void;
  openMaintenanceCount: number;
  sourceTaskId?: string;
  unitId: string;
}) {
  return (
    <nav aria-label="Unit record sections" className="overflow-x-auto border-b border-border">
      <div className="flex min-w-max items-center gap-1" role="tablist">
        {unitRecordSections.map((item) => {
          const href = buildUnitRecordHref({
            section: item.id,
            sourceTaskId,
            unitId,
          });

          return (
            <button
              aria-controls={
                activeSection === item.id ? `unit-panel-${item.id}` : undefined
              }
              aria-selected={activeSection === item.id}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                activeSection === item.id && "border-primary text-foreground",
              )}
              id={`unit-tab-${item.id}`}
              key={item.id}
              onClick={() => {
                onSectionChange(item.id);
                window.history.pushState(null, "", href);
              }}
              role="tab"
              type="button"
            >
              {item.label}
              {item.id === "maintenance" && openMaintenanceCount > 0 ? (
                <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] leading-none text-warning">
                  {openMaintenanceCount} open
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function buildUnitProfitLossHref(
  unit: Pick<UnitDetail, "id" | "propertyId">,
  month: string,
) {
  const params = new URLSearchParams({
    month,
    propertyId: unit.propertyId,
    unitId: unit.id,
  });

  return buildReportBuilderHref("unit-profit-loss", params);
}

function SectionTitle({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
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
    <div className="min-w-0 px-0 py-2 sm:px-4 sm:py-0 first:pl-0 last:pr-0">
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
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
  tone,
  value,
}: {
  label: string;
  note?: string;
  tone: "danger" | "success";
  value: MoneyDisplayValue;
}) {
  return (
    <div className="min-w-0 px-0 py-2 sm:px-4 sm:py-0 first:pl-0 last:pr-0">
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-1 text-lg font-semibold", tone === "success" ? "text-success" : "text-danger")}>
        <MoneyDisplay size="large" value={value} />
      </dd>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function ActionButton({
  children,
  icon,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function LedgerRow({
  entry,
  onOpen,
}: {
  entry: UnitLedgerContext;
  onOpen: () => void;
}) {
  return (
    <button
      aria-label={`Review ${entry.category} ledger entry`}
      className="block w-full py-3 text-left text-sm transition-colors hover:bg-muted/60"
      onClick={onOpen}
      type="button"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{entry.category}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(entry.transactionDate)} · {entry.direction}
          </p>
        </div>
        <MoneyDisplay align="right" value={entry.amountDisplay} />
      </div>
    </button>
  );
}

function MaintenanceRow({
  maintenanceCase,
  onOpen,
}: {
  maintenanceCase: UnitMaintenanceContext;
  onOpen: () => void;
}) {
  return (
    <button
      aria-label={`Review ${maintenanceCase.title} maintenance case`}
      className="block w-full py-3 text-left text-sm transition-colors hover:bg-muted/60"
      onClick={onOpen}
      type="button"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{maintenanceCase.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {maintenanceCase.category} · {maintenanceCase.dueLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone={maintenanceCase.statusTone}>{maintenanceCase.statusLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {maintenanceCase.actualCostLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

function DocumentRow({ document }: { document: UnitDocumentContext }) {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium">{document.fileName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {document.category} · {document.linkedRecordLabel} · {formatDate(document.uploadedAt)}
        </p>
      </div>
      <FileText className="shrink-0 text-muted-foreground" size={15} />
    </div>
  );

  if (document.url) {
    return (
      <a
        className="block py-3 text-sm transition-colors hover:bg-muted/60"
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
        className="block py-3 text-sm transition-colors hover:bg-muted/60"
        href={document.linkedRecordHref}
        prefetch={false}
      >
        {content}
      </Link>
    );
  }

  return <div className="py-3 text-sm">{content}</div>;
}

function ActivityRow({ change }: { change: RecentChange }) {
  const content = (
    <div className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="font-medium">{change.actionLabel}</p>
      <p className="text-xs text-muted-foreground">
        {formatDate(change.createdAt)} · {change.recordLabel}
      </p>
    </div>
  );

  return change.href ? (
    <Link className="block hover:bg-muted/60" href={change.href} prefetch={false}>
      {content}
    </Link>
  ) : (
    content
  );
}

function getHealthToneLabel(tone: UnitDetail["healthIndicators"][number]["tone"]) {
  if (tone === "danger") {
    return "Risk";
  }

  if (tone === "warning") {
    return "Review";
  }

  return "Info";
}
