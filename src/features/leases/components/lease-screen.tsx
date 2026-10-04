"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { useRegisterSearch } from "@/components/ui/use-register-search";
import { LeaseFilters } from "@/features/leases/components/lease-filters";
import { LeaseInspector } from "@/features/leases/components/lease-inspector";
import { LeasesTable } from "@/features/leases/components/leases-table";
import { buildLeaseRecordHref } from "@/features/leases/lease-detail-route";
import type {
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
type LeaseScreenProps = {
  canPrepare?: boolean;
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
  unitOptions,
  viewQuery,
}: LeaseScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const search = useRegisterSearch(viewQuery.query, value => replaceParam("query", value, ""));
  const [selectedLeaseId, setSelectedLeaseId] = useState(() =>
    getInitialRecordId(leases, initialLeaseId),
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
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
    buildLeaseRecordHref({ leaseId });
  const previewLease = (leaseId: string) => {
    search.cancelPending();
    setSelectedLeaseId(leaseId);
    setCompactInspectorOpen(true);
  };
  const openLease = (leaseId: string) => {
    search.cancelPending();
    router.push(getLeaseRecordHref(leaseId));
  };

  // Keep the register's existing filter serialization and reset behavior.
  function replaceParam(name: string, value: string, defaultValue: string, deleteNames: string[] = []) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (value === defaultValue || value.trim() === "") nextParams.delete(name);
    else nextParams.set(name, value);
    nextParams.delete("page");
    nextParams.delete("leaseId");
    for (const deleteName of deleteNames) nextParams.delete(deleteName);
    const queryString = nextParams.toString();
    startTransition(() => router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    if (!focusedLeaseId || searchParams.get("action") === "create") {
      return;
    }

    router.replace(buildLeaseRecordHref({ leaseId: focusedLeaseId }), { scroll: false });
  }, [focusedLeaseId, router, searchParams]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    router.replace("/properties?notice=choose-lease-context", {
      scroll: false,
    });
  }, [router, searchParams]);

  const hasFilters = hasActiveLeaseFilters(viewQuery);
  const leaseList = (
    <section className="flex min-w-0 flex-col bg-background">
      {leases.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={pathname}
                scroll={false}
              >
                Clear filters
              </Link>
            ) : undefined
          }
          body={hasFilters ? "No lease records match the active filters." : "No lease records are available in this workspace."}
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching leases" : "No leases yet"}
        />
      ) : (
        <div
          className="workspace-gutter-x min-h-0 flex-1 py-3 lg:pt-0"
          data-slot="lease-register-gutter"
        >
          <div
            className="bg-background md:overflow-hidden"
            data-slot="lease-register-surface"
          >
            <div className="min-h-0 flex-1 pb-3 md:pb-0">
              <LeasesTable
                archiveState={viewQuery.archiveState}
                leases={leases}
                getLeaseHref={getLeaseRecordHref}
                onOpenLease={openLease}
                onPreviewLease={previewLease}
                selectedLeaseId={compactInspectorOpen ? selectedLease?.id ?? "" : ""}
              />
            </div>
            <PaginationControls pagination={pagination} />
          </div>
        </div>
      )}
    </section>
  );
  const leaseInspector = selectedLease ? (
    <LeaseInspector
      lease={selectedLease}
      getLeaseHref={getLeaseRecordHref}
    />
  ) : null;

  return (
    <WorkspacePage
      context={
        <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>{pagination.totalCount} {pagination.totalCount === 1 ? "record" : "records"}</span>
          <span>Create leases from a Property or Unit record.</span>
        </span>
      }
      contextHref="/leases"
      headerClassName="py-3 lg:py-3"
      title="Leases"
    >
      <div
        className="flex min-w-0 flex-col"
        onClickCapture={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
          if (link && (!link.getAttribute("target") || link.getAttribute("target") === "_self")) search.cancelPending();
        }}
      >

      <div
        aria-label="Workspace tools"
        className="workspace-gutter-x shrink-0 border-b border-border py-2"
        role="toolbar"
      >
        <LeaseFilters
          navigation={{ isPending, replaceParam, search }}
          properties={propertyOptions}
          units={unitOptions}
          viewQuery={viewQuery}
        />
      </div>

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
              inspectorLabel={`${selectedLease.tenantName} lease quick view`}
              inspectorOpen={compactInspectorOpen}
              list={leaseList}
              onInspectorOpenChange={setCompactInspectorOpen}
            />
          ) : (
            <WorkspaceSplitView list={leaseList} />
          )}
        </div>
      </div>

    </WorkspacePage>
  );
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
  const title = `${count} ${count === 1 ? "lease" : "leases"} ${context.countLabel}${propertyLabel ? ` in ${propertyLabel}` : ""}`;

  return (
    <div className="shrink-0 bg-warning-soft/20 px-4 py-2 sm:px-6">
      <ConsequencePanel
        className="grid min-w-0 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-baseline [&>div]:mt-0 [&>h3]:truncate"
        summary={
          <div className="flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <span className="min-w-0 text-muted-foreground">
              {context.description}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {context.nextStep}
            </span>
          </div>
        }
        title={title}
        variant="inline"
      />
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
    viewQuery.endMonth !== ""
  );
}
