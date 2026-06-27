"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchiveUnitPanel,
  RestoreUnitPanel,
} from "@/features/units/components/unit-drawer-panels";
import { UnitForm } from "@/features/units/components/unit-form";
import { UnitFilters } from "@/features/units/components/unit-filters";
import { UnitInspector } from "@/features/units/components/unit-inspector";
import { UnitsTable } from "@/features/units/components/units-table";
import type {
  UnitDisplayMode,
  UnitPagination,
  UnitPropertyOption,
  UnitSummary,
  UnitViewQuery,
} from "@/features/units/unit.types";

type DrawerState =
  | { mode: "create"; unit?: never }
  | { mode: "edit"; unit: UnitSummary }
  | { mode: "archive"; unit: UnitSummary }
  | { mode: "restore"; unit: UnitSummary };

type UnitScreenProps = {
  initialUnitId?: string;
  pagination: UnitPagination;
  propertyOptions: UnitPropertyOption[];
  units: UnitSummary[];
  viewQuery: UnitViewQuery;
};

export function UnitScreen({
  initialUnitId,
  pagination,
  propertyOptions,
  units,
  viewQuery,
}: UnitScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isVacantReview = viewQuery.status === "vacant";
  const isOccupancyReview = viewQuery.occupancy === "unoccupied";
  const isLeaseReview = viewQuery.leaseStatus === "missing";
  const activeReview = getUnitReviewContext({
    isLeaseReview,
    isOccupancyReview,
    isVacantReview,
    propertyId: viewQuery.propertyId,
  });
  const reviewPropertyLabel = getSelectedPropertyLabel(
    propertyOptions,
    viewQuery.propertyId,
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create" ? { mode: "create" } : null,
  );
  const [displayMode, setDisplayMode] = useState<UnitDisplayMode>("table");
  const [selectedUnitId, setSelectedUnitId] = useState(() =>
    getInitialRecordId(units, initialUnitId),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedUnit =
    units.find((unit) => unit.id === selectedUnitId) ?? units[0] ?? null;
  const openUnitRecord = (unitId: string) => {
    router.push(`/units/${unitId}`);
  };

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            {activeReview?.reportHref ? (
              <Link
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
                href={activeReview.reportHref}
              >
                <FileText size={15} />
                Make report
              </Link>
            ) : null}
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawer({ mode: "create" });
              }}
              variant="primary"
            >
              <Plus size={15} />
              Add unit
            </Button>
          </>
        }
        description={
          activeReview
            ? activeReview.description
            : "Operational unit records connected to parent properties, leases, ledger rows, and timeline history."
        }
        title="Units"
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

      <UnitFilters
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        properties={propertyOptions}
        viewQuery={viewQuery}
      />

      {activeReview ? (
        <UnitReviewStrip
          count={pagination.totalCount}
          context={activeReview}
          propertyLabel={reviewPropertyLabel}
        />
      ) : null}

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <UnitsTable
              archiveState={viewQuery.archiveState}
              displayMode={displayMode}
              onArchiveUnit={(unit) => {
                setStatusMessage(null);
                setDrawer({ mode: "archive", unit });
              }}
              onEditUnit={(unit) => {
                setStatusMessage(null);
                setDrawer({ mode: "edit", unit });
              }}
              onRestoreUnit={(unit) => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", unit });
              }}
              onOpenUnit={openUnitRecord}
              onSelectUnit={setSelectedUnitId}
              selectedUnitId={selectedUnit?.id ?? ""}
              units={units}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <div className="hidden 2xl:block">
            <UnitInspector
              onArchiveUnit={(unit) => {
                setStatusMessage(null);
                setDrawer({ mode: "archive", unit });
              }}
              onEditUnit={(unit) => {
                setStatusMessage(null);
                setDrawer({ mode: "edit", unit });
              }}
              onRestoreUnit={(unit) => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", unit });
              }}
              unit={selectedUnit}
            />
          </div>
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getUnitDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getUnitDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchiveUnitPanel
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              unit={drawer.unit}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreUnitPanel
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              unit={drawer.unit}
            />
          ) : (
            <UnitForm
              key={`${drawer.mode}-${drawer.unit?.id ?? "new"}`}
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              unit={drawer.unit}
            />
          )}
        </SideDrawer>
      ) : null}
    </div>
  );
}

function getInitialRecordId<TRecord extends { id: string }>(
  records: TRecord[],
  initialId?: string,
) {
  return initialId && records.some((record) => record.id === initialId)
    ? initialId
    : records[0]?.id ?? "";
}

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");

  const queryString = nextParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function UnitReviewStrip({
  count,
  context,
  propertyLabel,
}: {
  count: number;
  context: UnitReviewContext;
  propertyLabel?: string;
}) {
  return (
    <div className="border-b border-border bg-warning-soft/20 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "unit" : "units"} {context.countLabel}
          {propertyLabel ? ` in ${propertyLabel}` : ""}
        </p>
        <p className="text-foreground-muted">
          {context.nextStep}
        </p>
      </div>
    </div>
  );
}

type UnitReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
  reportHref?: string;
};

function getUnitReviewContext({
  isLeaseReview,
  isOccupancyReview,
  isVacantReview,
  propertyId,
}: {
  isLeaseReview: boolean;
  isOccupancyReview: boolean;
  isVacantReview: boolean;
  propertyId: string;
}): UnitReviewContext | null {
  if (isVacantReview) {
    return {
      countLabel: "marked vacant",
      description:
        "Showing vacant units. Select a row to attach a lease, update status, or make the available-units report.",
      nextStep: "Use Make report for the printable vacant-unit list.",
      reportHref: getVacantUnitsReportHref(propertyId),
    };
  }

  if (isOccupancyReview) {
    return {
      countLabel: "not currently occupied",
      description:
        "Showing units that are not occupied. Select a row to add a lease or update the unit status.",
      nextStep:
        "Add a lease from the inspector, or edit status if the unit is vacant.",
    };
  }

  if (isLeaseReview) {
    return {
      countLabel: "without an active lease",
      description:
        "Showing units without an active lease. Select a row to add a lease or update the unit status.",
      nextStep:
        "Add a lease from the inspector, or edit status if the lease record is missing.",
    };
  }

  return null;
}

function getVacantUnitsReportHref(propertyId: string) {
  const params = new URLSearchParams({ status: "vacant" });

  if (propertyId !== "all") {
    params.set("propertyId", propertyId);
  }

  return `/reports?${params.toString()}`;
}

function getSelectedPropertyLabel(
  properties: UnitPropertyOption[],
  propertyId: string,
) {
  if (propertyId === "all") {
    return undefined;
  }

  return properties.find((property) => property.id === propertyId)?.label;
}

function getUnitDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Add unit";
  }

  if (drawer.mode === "edit") {
    return "Edit unit";
  }

  if (drawer.mode === "restore") {
    return "Restore unit";
  }

  return "Archive unit";
}

function getUnitDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a unit record under an active property.";
  }

  if (drawer.mode === "edit") {
    return "Update the unit profile used by leases, timeline records, and ledger rows.";
  }

  if (drawer.mode === "restore") {
    return "Return this archived unit to normal operational views.";
  }

  return "Hide this unit from active operational views without deleting its history.";
}
