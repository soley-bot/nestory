"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, ScrollText } from "lucide-react";
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
  ArchiveUnitPanel,
  RestoreUnitPanel,
} from "@/features/units/components/unit-drawer-panels";
import { UnitForm } from "@/features/units/components/unit-form";
import { UnitFilters } from "@/features/units/components/unit-filters";
import { UnitInspector } from "@/features/units/components/unit-inspector";
import { UnitsTable } from "@/features/units/components/units-table";
import type {
  UnitDisplayMode,
  UnitFormValues,
  UnitPagination,
  UnitPropertyOption,
  UnitSummary,
  UnitViewQuery,
} from "@/features/units/unit.types";

type UnitCreateInitialValues = Partial<Pick<UnitFormValues, "propertyId">>;

type DrawerState =
  | { initialValues?: UnitCreateInitialValues; mode: "create"; unit?: never }
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
  const createInitialValues = useMemo(
    () => getUnitCreateInitialValues(viewQuery, propertyOptions),
    [propertyOptions, viewQuery],
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [displayMode, setDisplayMode] = useState<UnitDisplayMode>(() =>
    searchParams.get("view") === "cards" ? "cards" : "table",
  );
  const isTableMode = displayMode === "table";
  const [selectedUnitId, setSelectedUnitId] = useState(() =>
    getInitialRecordId(units, initialUnitId),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusedUnit = initialUnitId
    ? units.find((unit) => unit.id === initialUnitId) ?? null
    : null;
  const focusedUnitId = focusedUnit?.id;
  const selectedUnit = getSelectedRecord({
    focusedRecordId: initialUnitId,
    records: units,
    selectedRecordId: selectedUnitId,
  });
  const fillVacancyHref =
    (isVacantReview || isLeaseReview) && selectedUnit && !selectedUnit.hasActiveLease
      ? getCreateLeaseHref(selectedUnit)
      : null;
  const fillLeaseLabel = isVacantReview ? "Fill vacancy" : "Add lease";
  const openUnitRecord = (unitId: string) => {
    router.push(`/units/${unitId}`);
  };
  const openUnitAction = (nextDrawer: DrawerState) => {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setPreviewOpen(true);
    }
  };
  const changeDisplayMode = (mode: UnitDisplayMode) => {
    setDisplayMode(mode);

    const nextParams = new URLSearchParams(searchParams.toString());

    if (mode === "table") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", mode);
    }

    const queryString = nextParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };

  useEffect(() => {
    if (focusedUnitId) {
      queueMicrotask(() => {
        setSelectedUnitId(focusedUnitId);
        if (window.matchMedia("(max-width: 1279px)").matches) {
          setPreviewOpen(true);
        }
      });
    }
  }, [focusedUnitId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ initialValues: createInitialValues, mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [createInitialValues, pathname, router, searchParams]);

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <PageHeader
        actions={
          <>
            {fillVacancyHref ? (
              <Link
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-warning-soft/70"
                href={fillVacancyHref}
              >
                <ScrollText size={15} />
                {fillLeaseLabel}
              </Link>
            ) : null}
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
                openUnitAction({ initialValues: createInitialValues, mode: "create" });
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
        onDisplayModeChange={changeDisplayMode}
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

      <div className="px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:px-6 lg:py-4">
        <div className="grid min-h-0 items-stretch gap-3 lg:h-full xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Unit records</p>
                <p className="text-foreground-muted">
                  Select a row to inspect. Double-click to open the full unit file.
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted">
                {pagination.totalCount} total
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <UnitsTable
                archiveState={viewQuery.archiveState}
                displayMode={displayMode}
                onArchiveUnit={(unit) => openUnitAction({ mode: "archive", unit })}
                onEditUnit={(unit) => openUnitAction({ mode: "edit", unit })}
                onRestoreUnit={(unit) => openUnitAction({ mode: "restore", unit })}
                onOpenUnit={openUnitRecord}
                onSelectUnit={previewUnit}
                selectedUnitId={selectedUnit?.id ?? ""}
                units={units}
              />
            </div>
            <PaginationControls attached={isTableMode} pagination={pagination} />
          </section>
          <aside className="hidden min-h-0 overflow-hidden rounded-md border border-border bg-surface xl:block">
            <UnitInspector
              onArchiveUnit={(unit) => openUnitAction({ mode: "archive", unit })}
              onEditUnit={(unit) => openUnitAction({ mode: "edit", unit })}
              onRestoreUnit={(unit) => openUnitAction({ mode: "restore", unit })}
              unit={selectedUnit}
            />
          </aside>
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedUnit)}
        title="Unit preview"
      >
        <UnitInspector
          onArchiveUnit={(unit) => openUnitAction({ mode: "archive", unit })}
          onEditUnit={(unit) => openUnitAction({ mode: "edit", unit })}
          onRestoreUnit={(unit) => openUnitAction({ mode: "restore", unit })}
          unit={selectedUnit}
        />
      </RecordPreviewDrawer>

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
              initialValues={
                drawer.mode === "create" ? drawer.initialValues : undefined
              }
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
        "Showing vacant units. Select a row, then fill the vacancy or make the available-units report.",
      nextStep: "Fill vacancy opens Add lease with the selected unit already scoped.",
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
        "Use Add lease for the selected row, or edit status if the unit is actually vacant.",
    };
  }

  return null;
}

export function getVacantUnitsReportHref(propertyId: string) {
  const params = new URLSearchParams({ status: "vacant" });

  if (propertyId !== "all") {
    params.set("propertyId", propertyId);
  }

  return `/reports/vacancy-risk?${params.toString()}`;
}

function getCreateLeaseHref(unit: UnitSummary) {
  const params = new URLSearchParams({
    action: "create",
    propertyId: unit.propertyId,
    source: "vacancy",
    unitId: unit.id,
  });

  return `/leases?${params.toString()}`;
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

function getUnitCreateInitialValues(
  viewQuery: UnitViewQuery,
  properties: UnitPropertyOption[],
): UnitCreateInitialValues | undefined {
  if (
    viewQuery.propertyId === "all" ||
    !properties.some((property) => property.id === viewQuery.propertyId)
  ) {
    return undefined;
  }

  return {
    propertyId: viewQuery.propertyId,
  };
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
