"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceSplitView } from "@/components/layout/workspace-split-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SideDrawer } from "@/components/ui/side-drawer";
import { removeActionSearchParam as getHrefWithoutActionParam } from "@/lib/url/href";
import {
  ArchivePropertyPanel,
  RestorePropertyPanel,
} from "@/features/properties/components/property-drawer-panels";
import { PropertyFilters } from "@/features/properties/components/property-filters";
import { PropertyForm } from "@/features/properties/components/property-form";
import { PropertyInspector } from "@/features/properties/components/property-inspector";
import { PropertiesTable } from "@/features/properties/components/properties-table";
import type { PropertySummary } from "@/features/properties/data/properties";
import { DEFAULT_PROPERTY_SORT } from "@/features/properties/property.filters";
import type {
  PropertyDisplayMode,
  PropertyOwnerOption,
  PropertyPagination,
  PropertySortKey,
  PropertyViewQuery,
} from "@/features/properties/property.types";

type DrawerState =
  | { mode: "create"; property?: never }
  | { mode: "edit"; property: PropertySummary }
  | { mode: "archive"; property: PropertySummary }
  | { mode: "restore"; property: PropertySummary };

type PropertyScreenProps = {
  canCreate: boolean;
  initialPropertyId?: string;
  ownerOptions: PropertyOwnerOption[];
  pagination: PropertyPagination;
  properties: PropertySummary[];
  viewQuery: PropertyViewQuery;
};

export function PropertyScreen({
  canCreate,
  initialPropertyId,
  ownerOptions,
  pagination,
  properties,
  viewQuery,
}: PropertyScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    canCreate && searchParams.get("action") === "create"
      ? { mode: "create" }
      : null,
  );
  const [displayMode, setDisplayMode] = useState<PropertyDisplayMode>(() =>
    searchParams.get("view") === "cards" ? "cards" : "table",
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initialPropertyId ?? properties[0]?.id ?? "",
  );
  const [quickViewOpen, setQuickViewOpen] = useState(Boolean(initialPropertyId));
  const isTableMode = displayMode === "table";
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedProperty =
    properties.find((property) => property.id === selectedPropertyId) ??
    properties[0] ??
    null;
  const reviewContext = getPropertyReviewContext(viewQuery);
  const openPropertyAction = (nextDrawer: DrawerState) => {
    setStatusMessage(null);
    setQuickViewOpen(false);
    setDrawer(nextDrawer);
  };
  const previewProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setQuickViewOpen(true);
  };
  const openPropertyRecord = (propertyId: string) => {
    router.push(`/properties/${propertyId}`);
  };
  const changeDisplayMode = (mode: PropertyDisplayMode) => {
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
  const changeSort = (sort: PropertySortKey) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (sort === DEFAULT_PROPERTY_SORT) {
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
      setStatusMessage(null);
      setDrawer({ mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [canCreate, pathname, router, searchParams]);

  const hasFilters =
    hasActivePropertyFilters(viewQuery) ||
    (properties.length === 0 && pagination.totalCount > 0);
  const openCreateProperty = () => {
    openPropertyAction({ mode: "create" });
  };
  const workspaceActions = (
    <>
      {canCreate ? (
        <Button onClick={openCreateProperty} variant="primary">
          <Plus size={15} />
          Add property
        </Button>
      ) : null}
    </>
  );
  const propertyList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {properties.length === 0 ? (
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
              <Button onClick={openCreateProperty} variant="primary">
                <Plus size={15} />
                Add property
              </Button>
            ) : undefined
          }
          body={
            hasFilters
              ? "The current filters return no property records."
              : "Your portfolio is empty."
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching properties" : "No properties yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <PropertiesTable
              displayMode={displayMode}
              onOpenProperty={openPropertyRecord}
              onPreviewProperty={previewProperty}
              onSortChange={changeSort}
              properties={properties}
              sort={viewQuery.sort}
            />
          </div>
          <PaginationControls attached={isTableMode} pagination={pagination} />
        </>
      )}
    </section>
  );
  return (
    <WorkspacePage
      actions={workspaceActions}
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref="/properties"
      title="Properties"
      toolbar={
        <PropertyFilters
          onDisplayModeChange={changeDisplayMode}
          displayMode={displayMode}
          onOpenProperty={openPropertyRecord}
          properties={properties}
          viewQuery={viewQuery}
        />
      }
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

      {reviewContext ? (
        <PropertyReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
        />
      ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          <WorkspaceSplitView
            inspector={
              <PropertyInspector
                onArchiveProperty={(property) =>
                  openPropertyAction({ mode: "archive", property })
                }
                onEditProperty={(property) =>
                  openPropertyAction({ mode: "edit", property })
                }
                onRestoreProperty={(property) =>
                  openPropertyAction({ mode: "restore", property })
                }
                property={selectedProperty}
              />
            }
            inspectorLabel={
              selectedProperty
                ? `${selectedProperty.name} quick view`
                : "Property quick view"
            }
            inspectorOpen={quickViewOpen && selectedProperty !== null}
            list={propertyList}
            onInspectorOpenChange={setQuickViewOpen}
          />
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getPropertyDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getPropertyDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchivePropertyPanel
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              property={drawer.property}
            />
          ) : drawer.mode === "restore" ? (
            <RestorePropertyPanel
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              property={drawer.property}
            />
          ) : (
            <PropertyForm
              key={`${drawer.mode}-${drawer.property?.id ?? "new"}`}
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              ownerOptions={ownerOptions}
              property={drawer.property}
            />
          )}
        </SideDrawer>
      ) : null}
    </WorkspacePage>
  );
}

type PropertyReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
};

function PropertyReviewStrip({
  context,
  count,
}: {
  context: PropertyReviewContext;
  count: number;
}) {
  return (
    <div className="border-b border-border bg-warning-soft/20 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "property" : "properties"} {context.countLabel}
        </p>
        <p className="text-foreground-muted">{context.nextStep}</p>
      </div>
    </div>
  );
}

function getPropertyReviewContext(
  viewQuery: PropertyViewQuery,
): PropertyReviewContext | null {
  if (viewQuery.ownerStatus === "missing") {
    return {
      countLabel: "missing a current owner link",
      description:
        "Showing properties that need a current owner link before ownership reporting and follow-up are reliable.",
      nextStep: "Current owner link required",
    };
  }

  if (viewQuery.netStatus === "negative") {
    return {
      countLabel: "with negative net income",
      description:
        "Showing properties where active ledger totals are below zero and need income, expense, or occupancy review.",
      nextStep: "Review ledger, units, or timeline",
    };
  }

  if (viewQuery.review === "needs_units") {
    return {
      countLabel: "without unit records",
      description:
        "Showing property shells that need units before leasing, vacancy, and operating history can work reliably.",
      nextStep: "Add the first unit",
    };
  }

  if (viewQuery.review === "missing_photos") {
    return {
      countLabel: "missing a property photo",
      description:
        "Showing properties that need at least one saved photo for visual identification.",
      nextStep: "Add a cover photo",
    };
  }

  if (viewQuery.review === "missing_address") {
    return {
      countLabel: "missing an address",
      description:
        "Showing properties that need an address before documents, reports, and field work are clear.",
      nextStep: "Add the property address",
    };
  }

  return null;
}

function hasActivePropertyFilters(viewQuery: PropertyViewQuery) {
  return (
    viewQuery.archiveState !== "active" ||
    viewQuery.netStatus !== "all" ||
    viewQuery.ownerStatus !== "all" ||
    viewQuery.query.trim().length > 0 ||
    viewQuery.review !== "all" ||
    viewQuery.status !== "all"
  );
}

function getPropertyDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Add property";
  }

  if (drawer.mode === "edit") {
    return "Edit property";
  }

  if (drawer.mode === "restore") {
    return "Restore property";
  }

  return "Archive property";
}

function getPropertyDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a property record that can hold property-level history or child units.";
  }

  if (drawer.mode === "edit") {
    return "Update the property profile used across units, timeline, and ledger records.";
  }

  if (drawer.mode === "restore") {
    return "Return this property to normal operational views.";
  }

  return "Hide this property from active operational views without deleting its history.";
}
