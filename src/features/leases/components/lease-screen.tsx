"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  useWideWorkspace,
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SideDrawer } from "@/components/ui/side-drawer";
import { removeSearchParams } from "@/lib/url/href";
import {
  ArchiveLeasePanel,
  RestoreLeasePanel,
} from "@/features/leases/components/lease-drawer-panels";
import {
  generateMonthlyRentAction,
  type LeaseActionState,
} from "@/features/leases/actions";
import { LeaseFilters } from "@/features/leases/components/lease-filters";
import { LeaseForm } from "@/features/leases/components/lease-form";
import { LeaseInspector } from "@/features/leases/components/lease-inspector";
import { LeasesTable } from "@/features/leases/components/leases-table";
import type {
  LeaseFormValues,
  LeasePagination,
  LeasePropertyOption,
  LeaseSummary,
  LeaseTenantOption,
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

const leaseMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});
const rentGenerationInitialState: LeaseActionState = {};

type LeaseCreateInitialValues = Partial<
  Pick<LeaseFormValues, "propertyId" | "tenantPersonId" | "unitId">
>;
type LeaseCreateIntent = "fill-vacancy" | "standard";

type DrawerState =
  | {
      intent?: LeaseCreateIntent;
      initialValues?: LeaseCreateInitialValues;
      lease?: never;
      mode: "create";
    }
  | { lease: LeaseSummary; mode: "archive" }
  | { lease: LeaseSummary; mode: "edit" }
  | { lease: LeaseSummary; mode: "restore" };

type LeaseScreenProps = {
  canCreate?: boolean;
  canGenerateRent?: boolean;
  initialLeaseId?: string;
  leases: LeaseSummary[];
  pagination: LeasePagination;
  propertyOptions: LeasePropertyOption[];
  tenantOptions: LeaseTenantOption[];
  unitOptions: LeaseUnitOption[];
  viewQuery: LeaseViewQuery;
};

export function LeaseScreen({
  canCreate = true,
  canGenerateRent = true,
  initialLeaseId,
  leases,
  pagination,
  propertyOptions,
  tenantOptions,
  unitOptions,
  viewQuery,
}: LeaseScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createInitialValues = useMemo(
    () =>
      getLeaseCreateInitialValues(
        searchParams,
        propertyOptions,
        tenantOptions,
        unitOptions,
      ),
    [propertyOptions, searchParams, tenantOptions, unitOptions],
  );
  const createIntent = getLeaseCreateIntent(searchParams, createInitialValues);
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    canCreate && searchParams.get("action") === "create"
      ? {
          initialValues: createInitialValues,
          intent: createIntent,
          mode: "create",
        }
      : null,
  );
  const [selectedLeaseId, setSelectedLeaseId] = useState(() =>
    getInitialRecordId(leases, initialLeaseId),
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(
    Boolean(initialLeaseId) &&
      (!canCreate || searchParams.get("action") !== "create"),
  );
  const isWideWorkspace = useWideWorkspace();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [rentState, generateRent, generatingRent] = useActionState(
    generateMonthlyRentAction,
    rentGenerationInitialState,
  );
  const focusedLease = initialLeaseId
    ? leases.find((lease) => lease.id === initialLeaseId) ?? null
    : null;
  const focusedLeaseId = focusedLease?.id;
  const selectedLease = getSelectedRecord({
    focusedRecordId: initialLeaseId,
    records: leases,
    selectedRecordId: selectedLeaseId,
  });
  const reviewContext = getLeaseReviewContext(viewQuery, {
    hasFocusedLease: Boolean(focusedLease),
    hasFocusedLeaseIntent: Boolean(initialLeaseId),
  });
  const reviewPropertyLabel = getSelectedPropertyLabel(
    propertyOptions,
    viewQuery.propertyId,
  );
  const getLeaseRecordHref = (leaseId: string) =>
    getFocusedRecordHref(pathname, searchParams, "leaseId", leaseId);
  const openLeaseAction = (nextDrawer: DrawerState) => {
    if (!isWideWorkspace) {
      setCompactInspectorOpen(false);
    }
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewLease = (leaseId: string) => {
    setSelectedLeaseId(leaseId);
    setCompactInspectorOpen(true);
  };

  useEffect(() => {
    if (!focusedLeaseId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedLeaseId(focusedLeaseId);
      setCompactInspectorOpen(true);
    });
  }, [focusedLeaseId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    if (!canCreate) {
      router.replace(getHrefWithoutActionParam(pathname, searchParams), {
        scroll: false,
      });
      return;
    }

    queueMicrotask(() => {
      setCompactInspectorOpen(false);
      setStatusMessage(null);
      setDrawer({
        initialValues: createInitialValues,
        intent: createIntent,
        mode: "create",
      });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [canCreate, createInitialValues, createIntent, pathname, router, searchParams]);

  useEffect(() => {
    if (rentState.status === "success" || rentState.status === "error") {
      queueMicrotask(() => {
        setStatusMessage(rentState.message ?? null);
      });
    }
  }, [rentState.message, rentState.status]);

  const hasFilters = hasActiveLeaseFilters(viewQuery);
  const leaseList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {leases.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={pathname}
                scroll={false}
              >
                Clear filters
              </Link>
            ) : canCreate ? (
              <Button onClick={() => openLeaseAction({ mode: "create" })} variant="primary">
                <Plus size={15} />
                Add lease
              </Button>
            ) : undefined
          }
          body={hasFilters ? "No lease records match the active filters." : "No lease records are available in this workspace."}
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching leases" : "No leases yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <LeasesTable
              archiveState={viewQuery.archiveState}
              leases={leases}
              getLeaseHref={getLeaseRecordHref}
              onSelectLease={previewLease}
              selectedLeaseId={selectedLease?.id ?? ""}
            />
          </div>
          <PaginationControls attached pagination={pagination} />
        </>
      )}
    </section>
  );
  const leaseInspector = selectedLease ? (
    <LeaseInspector
      lease={selectedLease}
      onArchiveLease={(lease) => openLeaseAction({ lease, mode: "archive" })}
      onEditLease={(lease) => openLeaseAction({ lease, mode: "edit" })}
      onRestoreLease={(lease) => openLeaseAction({ lease, mode: "restore" })}
      getLeaseHref={getLeaseRecordHref}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        <div className="flex flex-wrap gap-2">
            {canGenerateRent ? (
              <form action={generateRent}>
                <Button disabled={generatingRent} type="submit">
                  {generatingRent ? "Generating..." : "Generate rent"}
                </Button>
              </form>
            ) : null}
            {canCreate ? (
              <Button
                onClick={() => openLeaseAction({ mode: "create" })}
                variant="primary"
              >
                <Plus size={15} />
                Add lease
              </Button>
            ) : null}
        </div>
      }
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref="/leases"
      title="Leases"
      toolbar={<LeaseFilters
        properties={propertyOptions}
        units={unitOptions}
        viewQuery={viewQuery}
      />}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">

      {statusMessage ? (
        <div className="shrink-0 px-4 py-2 sm:px-6">
          <div
            className="flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
            <p className="font-medium text-foreground">{statusMessage}</p>
          </div>
        </div>
      ) : null}

      <LeaseCommandStrip leases={leases} />

      {reviewContext ? (
        <LeaseReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
          propertyLabel={reviewPropertyLabel}
        />
      ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {leaseInspector && selectedLease ? (
            <WorkspaceSplitView
              inspector={leaseInspector}
              inspectorLabel={`${selectedLease.tenantName} lease inspector`}
              inspectorOpen={isWideWorkspace || compactInspectorOpen}
              list={leaseList}
              onInspectorOpenChange={setCompactInspectorOpen}
            />
          ) : (
            <WorkspaceSplitView list={leaseList} />
          )}
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getLeaseDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getLeaseDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchiveLeasePanel
              lease={drawer.lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreLeasePanel
              lease={drawer.lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <LeaseForm
              initialValues={
                drawer.mode === "create" ? drawer.initialValues : undefined
              }
              key={getLeaseFormKey(drawer)}
              lease={drawer.lease}
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              tenants={tenantOptions}
              units={unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}
    </WorkspacePage>
  );
}

function getFocusedRecordHref(
  pathname: string,
  searchParams: { toString(): string },
  key: string,
  value: string,
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.set(key, value);

  return `${pathname}?${nextParams.toString()}`;
}

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  return removeSearchParams(pathname, searchParams, [
    "action",
    "source",
    "tenantPersonId",
  ]);
}

function getLeaseCreateIntent(
  searchParams: { get(name: string): string | null },
  initialValues?: LeaseCreateInitialValues,
): LeaseCreateIntent {
  return searchParams.get("source") === "vacancy" && initialValues?.unitId
    ? "fill-vacancy"
    : "standard";
}

function getLeaseCreateInitialValues(
  searchParams: { get(name: string): string | null },
  properties: LeasePropertyOption[],
  tenants: LeaseTenantOption[],
  units: LeaseUnitOption[],
): LeaseCreateInitialValues | undefined {
  const requestedPropertyId = searchParams.get("propertyId") ?? "";
  const requestedTenantPersonId = tenants.some(
    (tenant) => tenant.id === searchParams.get("tenantPersonId"),
  )
    ? searchParams.get("tenantPersonId") ?? ""
    : "";
  const requestedUnitId = searchParams.get("unitId") ?? "";
  const requestedUnit = units.find((unit) => unit.id === requestedUnitId);
  const propertyId =
    requestedUnit?.propertyId ??
    (properties.some((property) => property.id === requestedPropertyId)
      ? requestedPropertyId
      : "");
  const unitId =
    requestedUnit && (!requestedPropertyId || requestedUnit.propertyId === propertyId)
      ? requestedUnit.id
      : "";

  if (!propertyId && !unitId && !requestedTenantPersonId) {
    return undefined;
  }

  return {
    propertyId,
    tenantPersonId: requestedTenantPersonId,
    unitId,
  };
}

function getLeaseFormKey(drawer: Extract<DrawerState, { mode: "create" | "edit" }>) {
  if (drawer.mode === "create") {
    return `create-${drawer.initialValues?.tenantPersonId ?? drawer.initialValues?.unitId ?? drawer.initialValues?.propertyId ?? "new"}`;
  }

  return `edit-${drawer.lease.id}`;
}

function getLeaseDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    if (drawer.intent === "fill-vacancy") {
      return "Fill vacancy";
    }

    return "Add lease";
  }

  if (drawer.mode === "edit") {
    return "Edit lease";
  }

  if (drawer.mode === "restore") {
    return "Restore lease";
  }

  return "Archive lease";
}

function getLeaseDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    if (drawer.intent === "fill-vacancy") {
      return "Create an active lease for the selected vacant unit and tenant. Saving the lease will mark the unit occupied.";
    }

    return "Create a lease record tied to a People tenant, property, optional unit, rent, and deposit.";
  }

  if (drawer.mode === "edit") {
    return "Update tenant, unit, status, dates, rent, and deposit.";
  }

  if (drawer.mode === "restore") {
    return "Return this archived lease to normal operational views.";
  }

  return "Hide this lease from active operational views without deleting its history.";
}

type LeaseReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
};

type FocusedLeaseState = {
  hasFocusedLease: boolean;
  hasFocusedLeaseIntent: boolean;
};

function LeaseReviewStrip({
  context,
  count,
  propertyLabel,
}: {
  context: LeaseReviewContext;
  count: number;
  propertyLabel?: string;
}) {
  return (
    <div className="border-b border-border bg-warning-soft/20 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "lease" : "leases"} {context.countLabel}
          {propertyLabel ? ` in ${propertyLabel}` : ""}
        </p>
        <p className="text-foreground-muted">{context.nextStep}</p>
      </div>
      <p className="mt-1 text-xs text-foreground-subtle">{context.description}</p>
    </div>
  );
}

function getLeaseReviewContext(
  viewQuery: LeaseViewQuery,
  focusedState: FocusedLeaseState,
): LeaseReviewContext | null {
  const endMonthLabel = viewQuery.endMonth
    ? formatLeaseMonth(viewQuery.endMonth)
    : "";

  if (focusedState.hasFocusedLease) {
    return {
      countLabel: "in this activity view",
      description: "Opened from recent activity with archived records included.",
      nextStep: "Focused lease ready for review.",
    };
  }

  if (focusedState.hasFocusedLeaseIntent) {
    return {
      countLabel: "in this activity view",
      description:
        "Opened from recent activity with archived records included, but this page did not include the focused lease.",
      nextStep: "Review visible matches or broaden the current filters.",
    };
  }

  if (viewQuery.endsWithinDays !== null && endMonthLabel) {
    return {
      countLabel: `ending in ${endMonthLabel}`,
      description: `Showing leases inside the next ${viewQuery.endsWithinDays} days and this month.`,
      nextStep: "Renewal, date, or move-out follow-up is due.",
    };
  }

  if (viewQuery.endsWithinDays !== null) {
    return {
      countLabel: `ending in the next ${viewQuery.endsWithinDays} days`,
      description: "Dashboard lease risk opens this renewal and move-out review.",
      nextStep: "Earliest end dates need renewal or move-out follow-up.",
    };
  }

  if (endMonthLabel) {
    return {
      countLabel: `ending in ${endMonthLabel}`,
      description: "Opened from the Dashboard lease-ending chart.",
      nextStep: "Renewal and move-out context is ready for review.",
    };
  }

  if (viewQuery.tenantStatus === "missing") {
    return {
      countLabel: "missing a tenant link",
      description: "Showing leases without a linked People tenant.",
      nextStep: "A People tenant link is required for reliable occupancy history.",
    };
  }

  if (viewQuery.status !== "all") {
    if (viewQuery.status === "current") {
      return {
        countLabel: "currently active or in notice",
        description: "Showing leases that count as current occupancy records.",
        nextStep: "Tenant, unit, rent, and term context is available per record.",
      };
    }

    return {
      countLabel: `with ${viewQuery.status.replace("_", " ")} status`,
      description: "Showing leases filtered by operational status.",
      nextStep: "The register is scoped to this lifecycle state.",
    };
  }

  return null;
}

function LeaseCommandStrip({
  leases,
}: {
  leases: LeaseSummary[];
}) {
  const currentCount = leases.filter(
    (lease) =>
      lease.statusValue === "active" || lease.statusValue === "notice_given",
  ).length;
  const endingSoonCount = leases.filter((lease) =>
    lease.riskIndicators.some((item) => item.id === "end" && item.tone !== "success"),
  ).length;
  const missingTenantCount = leases.filter(
    (lease) => !lease.formValues.tenantPersonId,
  ).length;
  const missingDocumentsCount = leases.filter(
    (lease) => lease.recordCounts.documents === 0,
  ).length;
  const rentAtRisk = leases
    .filter((lease) =>
      lease.riskIndicators.some((item) => item.id === "end" && item.tone !== "success"),
    )
    .reduce((total, lease) => total + lease.rentUsd, 0);

  return (
    <section
      aria-label="Lease summary"
      className="shrink-0 border-b border-border bg-surface px-4 py-2 sm:px-6"
      role="region"
    >
      <div
        aria-label="Lease metrics"
        className="flex min-w-0 overflow-x-auto rounded-md border border-border bg-surface-muted/25 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
        data-mobile-summary-strip="lease-metrics"
        tabIndex={0}
      >
        <div className="flex min-w-[84px] shrink-0 items-center border-r border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          This page
        </div>
        <LeaseCommandMetric label="Leases" value={String(leases.length)} />
        <LeaseCommandMetric label="Current" value={String(currentCount)} />
        <LeaseCommandMetric
          label="Ending risk"
          tone={endingSoonCount > 0 ? "warning" : "success"}
          value={String(endingSoonCount)}
        />
        <LeaseCommandMetric
          label="Tenant gaps"
          tone={missingTenantCount > 0 ? "warning" : "success"}
          value={String(missingTenantCount)}
        />
        <LeaseCommandMetric
          label="Missing docs"
          tone={missingDocumentsCount > 0 ? "warning" : "success"}
          value={String(missingDocumentsCount)}
        />
        <LeaseCommandMetric
          label="Rent at risk"
          tone={rentAtRisk > 0 ? "warning" : "neutral"}
          value={formatDollarMetric(rentAtRisk)}
        />
      </div>
    </section>
  );
}

function LeaseCommandMetric({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
  value: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";

  return (
    <div className="min-w-[128px] flex-1 border-r border-border px-3 py-2 last:border-r-0">
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function formatDollarMetric(value: number) {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  });
}

function formatLeaseMonth(monthValue: string) {
  const date = new Date(`${monthValue}-01T00:00:00.000Z`);

  return Number.isNaN(date.getTime())
    ? monthValue
    : leaseMonthFormatter.format(date);
}

function getSelectedPropertyLabel(
  properties: LeasePropertyOption[],
  propertyId: string,
) {
  if (propertyId === "all") {
    return undefined;
  }

  return properties.find((property) => property.id === propertyId)?.label;
}

function hasActiveLeaseFilters(viewQuery: LeaseViewQuery) {
  return (
    viewQuery.query.trim().length > 0 ||
    viewQuery.propertyId !== "all" ||
    viewQuery.unitId !== "all" ||
    viewQuery.status !== "all" ||
    viewQuery.tenantStatus !== "all" ||
    viewQuery.archiveState !== "active" ||
    viewQuery.endsWithinDays !== null ||
    viewQuery.endMonth !== "" ||
    viewQuery.sort !== "start_desc" ||
    viewQuery.pageSize !== 50
  );
}
