"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SideDrawer } from "@/components/ui/side-drawer";
import { removeActionSearchParam as getHrefWithoutActionParam } from "@/lib/url/href";
import {
  ArchiveUnitPanel,
  RestoreUnitPanel,
} from "@/features/units/components/unit-drawer-panels";
import { UnitForm } from "@/features/units/components/unit-form";
import { UnitFilters } from "@/features/units/components/unit-filters";
import { UnitInspector } from "@/features/units/components/unit-inspector";
import { UnitsTable } from "@/features/units/components/units-table";
import { DEFAULT_UNIT_SORT } from "@/features/units/unit.filters";
import type {
  UnitDisplayMode,
  UnitFormValues,
  UnitPagination,
  UnitPropertyOption,
  UnitSortKey,
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
  canCreate: boolean;
  initialUnitId?: string;
  pagination: UnitPagination;
  propertyOptions: UnitPropertyOption[];
  units: UnitSummary[];
  viewQuery: UnitViewQuery;
};

export function UnitScreen({
  canCreate,
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
    canCreate && searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [displayMode, setDisplayMode] = useState<UnitDisplayMode>(() =>
    searchParams.get("view") === "cards" ? "cards" : "table",
  );
  const [selectedUnitId, setSelectedUnitId] = useState(() =>
    getInitialRecordId(units, initialUnitId),
  );
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(
    Boolean(initialUnitId) &&
      (!canCreate || searchParams.get("action") !== "create"),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const focusedUnit = initialUnitId
    ? units.find((unit) => unit.id === initialUnitId) ?? null
    : null;
  const focusedUnitId = focusedUnit?.id;
  const selectedUnit = getSelectedRecord({
    focusedRecordId: initialUnitId,
    records: units,
    selectedRecordId: selectedUnitId,
  });
  const openUnitAction = (nextDrawer: DrawerState) => {
    setCompactInspectorOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewUnit = (unitId: string) => {
    previewTriggerRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    setSelectedUnitId(unitId);
    setCompactInspectorOpen(true);
  };
  const closeEditModal = () => {
    const unitNumber = drawer?.mode === "edit" ? drawer.unit.unitNumber : null;
    const fallbackTarget = unitNumber
      ? Array.from(document.querySelectorAll<HTMLElement>("[aria-label]")).find(
          (element) =>
            element.getAttribute("aria-label") === `Preview unit ${unitNumber}`,
        ) ?? null
      : null;
    const returnTarget = previewTriggerRef.current ?? fallbackTarget;

    setDrawer(null);
    queueMicrotask(() => returnTarget?.focus());
  };
  const openUnitRecord = (unitId: string) => {
    router.push(`/units/${unitId}`);
  };
  const changeSort = (sort: UnitSortKey) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (sort === DEFAULT_UNIT_SORT) {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", sort);
    }

    nextParams.delete("page");
    const queryString = nextParams.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
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
        setCompactInspectorOpen(true);
      });
    }
  }, [focusedUnitId]);

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
      setDrawer({ initialValues: createInitialValues, mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [canCreate, createInitialValues, pathname, router, searchParams]);

  const hasFilters =
    hasActiveUnitFilters(viewQuery) ||
    (units.length === 0 && pagination.totalCount > 0);
  const openCreateUnit = () => {
    openUnitAction({ initialValues: createInitialValues, mode: "create" });
  };
  const unitList = (
    <section className="flex min-w-0 flex-col bg-card">
      {units.length === 0 ? (
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
            ) : canCreate ? (
              <Button onClick={openCreateUnit} variant="default">
                <Plus size={15} />
                Add unit
              </Button>
            ) : undefined
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching units" : "No units yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <UnitsTable
              archiveState={viewQuery.archiveState}
              displayMode={displayMode}
              onArchiveUnit={(unit) => openUnitAction({ mode: "archive", unit })}
              onEditUnit={(unit) => openUnitAction({ mode: "edit", unit })}
              onOpenUnit={openUnitRecord}
              onRestoreUnit={(unit) => openUnitAction({ mode: "restore", unit })}
              onSelectUnit={previewUnit}
              onSortChange={changeSort}
              selectedUnitId={compactInspectorOpen ? selectedUnit?.id ?? "" : ""}
              sort={viewQuery.sort}
              units={units}
            />
          </div>
          <PaginationControls pagination={pagination} />
        </>
      )}
    </section>
  );
  const unitInspector = selectedUnit ? (
    <UnitInspector
      onArchiveUnit={(unit) => openUnitAction({ mode: "archive", unit })}
      onEditUnit={(unit) => openUnitAction({ mode: "edit", unit })}
      onRestoreUnit={(unit) => openUnitAction({ mode: "restore", unit })}
      unit={selectedUnit}
    />
  ) : null;

  return (
    <WorkspacePage
      actions={
        <>
            {activeReview?.reportHref ? (
              <Link
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                href={activeReview.reportHref}
              >
                <FileText size={15} />
                Make report
              </Link>
            ) : null}
            {canCreate ? (
              <Button onClick={openCreateUnit} variant="default">
                <Plus size={15} />
                Add unit
              </Button>
            ) : null}
        </>
      }
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref="/units"
      title="Units"
      toolbar={
        <UnitFilters
          displayMode={displayMode}
          onDisplayModeChange={changeDisplayMode}
          properties={propertyOptions}
          viewQuery={viewQuery}
        />
      }
    >
      <div className="flex min-w-0 flex-col">

      {statusMessage ? (
        <div className="shrink-0 px-4 py-2 sm:px-6">
          <p
            className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      {activeReview ? (
        <UnitReviewStrip
          count={pagination.totalCount}
          context={activeReview}
          propertyLabel={reviewPropertyLabel}
        />
      ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {unitInspector && selectedUnit ? (
            <WorkspaceSplitView
              inspector={unitInspector}
              inspectorLabel={`Unit ${selectedUnit.unitNumber} quick view`}
              inspectorOpen={compactInspectorOpen}
              list={unitList}
              onInspectorOpenChange={setCompactInspectorOpen}
            />
          ) : (
            <WorkspaceSplitView list={unitList} />
          )}
        </div>
      </div>

      {drawer?.mode === "edit" ? (
        <SideDrawer onClose={closeEditModal} open title="Edit unit">
          <UnitForm
            key={`edit-${drawer.unit.id}`}
            mode="edit"
            onClose={closeEditModal}
            onSuccess={setStatusMessage}
            properties={propertyOptions}
            unit={drawer.unit}
          />
        </SideDrawer>
      ) : drawer ? (
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
              key="create-new"
              initialValues={drawer.initialValues}
              mode="create"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
            />
          )}
        </SideDrawer>
      ) : null}
    </WorkspacePage>
  );
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
      <div className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "unit" : "units"} {context.countLabel}
          {propertyLabel ? ` in ${propertyLabel}` : ""}
        </p>
        <p className="text-muted-foreground">
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
        "Vacant units ready for leasing review.",
      nextStep: "Fill vacancy or create the vacancy report",
      reportHref: getVacantUnitsReportHref(propertyId),
    };
  }

  if (isOccupancyReview) {
    return {
      countLabel: "not currently occupied",
      description:
        "Units without current occupancy.",
      nextStep: "Add a lease or update status",
    };
  }

  if (isLeaseReview) {
    return {
      countLabel: "without an active lease",
      description:
        "Units without an active lease.",
      nextStep: "Add a lease or update status",
    };
  }

  return null;
}

function hasActiveUnitFilters(viewQuery: UnitViewQuery) {
  return (
    viewQuery.archiveState !== "active" ||
    viewQuery.leaseStatus !== "all" ||
    viewQuery.occupancy !== "all" ||
    viewQuery.propertyId !== "all" ||
    viewQuery.query.trim().length > 0 ||
    viewQuery.status !== "all"
  );
}

export function getVacantUnitsReportHref(propertyId: string) {
  const params = new URLSearchParams({ occupancy: "unoccupied" });

  if (propertyId !== "all") {
    params.set("propertyId", propertyId);
  }

  return `/units?${params.toString()}`;
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
  if (drawer.mode === "create" || drawer.mode === "edit") {
    return undefined;
  }

  if (drawer.mode === "restore") {
    return "Return this archived unit to normal operational views.";
  }

  return "Hide this unit from active operational views without deleting its history.";
}
