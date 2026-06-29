"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchiveLeasePanel,
  RestoreLeasePanel,
} from "@/features/leases/components/lease-drawer-panels";
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
  initialLeaseId?: string;
  leases: LeaseSummary[];
  pagination: LeasePagination;
  propertyOptions: LeasePropertyOption[];
  tenantOptions: LeaseTenantOption[];
  unitOptions: LeaseUnitOption[];
  viewQuery: LeaseViewQuery;
};

export function LeaseScreen({
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
    searchParams.get("action") === "create"
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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
  const openLeaseRecord = (leaseId: string) => {
    router.push(getLeaseRecordHref(leaseId), { scroll: false });
  };
  const openLeaseAction = (nextDrawer: DrawerState) => {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewLease = (leaseId: string) => {
    setSelectedLeaseId(leaseId);
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!focusedLeaseId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedLeaseId(focusedLeaseId);
      setPreviewOpen(true);
    });
  }, [focusedLeaseId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
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
  }, [createInitialValues, createIntent, pathname, router, searchParams]);

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <Button
            onClick={() => openLeaseAction({ mode: "create" })}
            variant="primary"
          >
            <Plus size={15} />
            Add lease
          </Button>
        }
        description="Operational lease records connected to tenants, units, terms, deposits, and occupancy history."
        title="Leases"
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-6">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <LeaseFilters
        properties={propertyOptions}
        units={unitOptions}
        viewQuery={viewQuery}
      />

      {reviewContext ? (
        <LeaseReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
          propertyLabel={reviewPropertyLabel}
        />
      ) : null}

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="min-w-0 space-y-0">
          <LeasesTable
            archiveState={viewQuery.archiveState}
            leases={leases}
            getLeaseHref={getLeaseRecordHref}
            onOpenLease={openLeaseRecord}
            onSelectLease={previewLease}
            selectedLeaseId={selectedLease?.id ?? ""}
          />
          <PaginationControls attached pagination={pagination} />
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedLease)}
        title="Lease preview"
      >
        <LeaseInspector
          lease={selectedLease}
          onArchiveLease={(lease) =>
            openLeaseAction({ lease, mode: "archive" })
          }
          onEditLease={(lease) => openLeaseAction({ lease, mode: "edit" })}
          onRestoreLease={(lease) =>
            openLeaseAction({ lease, mode: "restore" })
          }
          getLeaseHref={getLeaseRecordHref}
        />
      </RecordPreviewDrawer>

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
    </div>
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
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");
  nextParams.delete("source");
  nextParams.delete("tenantPersonId");

  const queryString = nextParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
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
    return "Update the lease terms used across unit, timeline, ledger, and tenant context.";
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
      nextStep: "The focused lease is selected for inspector review.",
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
      nextStep: "Select a lease to renew, edit dates, or prepare move-out follow-up.",
    };
  }

  if (viewQuery.endsWithinDays !== null) {
    return {
      countLabel: `ending in the next ${viewQuery.endsWithinDays} days`,
      description: "Dashboard lease risk opens this renewal and move-out review.",
      nextStep: "Select the earliest lease first, then renew, edit, or follow up.",
    };
  }

  if (endMonthLabel) {
    return {
      countLabel: `ending in ${endMonthLabel}`,
      description: "Opened from the Dashboard lease-ending chart.",
      nextStep: "Select a lease to inspect tenant, unit, rent, and term details.",
    };
  }

  if (viewQuery.tenantStatus === "missing") {
    return {
      countLabel: "missing a tenant link",
      description: "Showing leases without a linked People tenant.",
      nextStep: "Select a lease, then edit it to choose the tenant record.",
    };
  }

  if (viewQuery.status !== "all") {
    if (viewQuery.status === "current") {
      return {
        countLabel: "currently active or in notice",
        description: "Showing leases that count as current occupancy records.",
        nextStep: "Select a lease to inspect tenant, unit, rent, and term details.",
      };
    }

    return {
      countLabel: `with ${viewQuery.status.replace("_", " ")} status`,
      description: "Showing leases filtered by operational status.",
      nextStep: "Clear filters to return to all active lease records.",
    };
  }

  return null;
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
