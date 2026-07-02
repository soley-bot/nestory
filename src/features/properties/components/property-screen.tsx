"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Pencil,
  Plus,
} from "lucide-react";
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
  ArchivePropertyPanel,
  RestorePropertyPanel,
} from "@/features/properties/components/property-drawer-panels";
import { PropertyFilters } from "@/features/properties/components/property-filters";
import { PropertyForm } from "@/features/properties/components/property-form";
import { PropertyInspector } from "@/features/properties/components/property-inspector";
import { PropertiesTable } from "@/features/properties/components/properties-table";
import type { PropertySummary } from "@/features/properties/data/properties";
import type {
  PropertyDisplayMode,
  PropertyOwnerOption,
  PropertyPagination,
  PropertyViewQuery,
} from "@/features/properties/property.types";

type DrawerState =
  | { mode: "create"; property?: never }
  | { mode: "edit"; property: PropertySummary }
  | { mode: "archive"; property: PropertySummary }
  | { mode: "restore"; property: PropertySummary };

type PropertyScreenProps = {
  initialPropertyId?: string;
  ownerOptions: PropertyOwnerOption[];
  pagination: PropertyPagination;
  properties: PropertySummary[];
  viewQuery: PropertyViewQuery;
};

export function PropertyScreen({
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
    searchParams.get("action") === "create" ? { mode: "create" } : null,
  );
  const [displayMode, setDisplayMode] =
    useState<PropertyDisplayMode>("table");
  const isTableMode = displayMode === "table";
  const [selectedPropertyId, setSelectedPropertyId] = useState(() =>
    getInitialRecordId(properties, initialPropertyId),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusedProperty = initialPropertyId
    ? properties.find((property) => property.id === initialPropertyId) ?? null
    : null;
  const focusedPropertyId = focusedProperty?.id;
  const selectedProperty = getSelectedRecord({
    focusedRecordId: initialPropertyId,
    records: properties,
    selectedRecordId: selectedPropertyId,
  });
  const reviewContext = getPropertyReviewContext(viewQuery);
  const openPropertyRecord = (propertyId: string) => {
    router.push(`/properties/${propertyId}`);
  };
  const openPropertyAction = (nextDrawer: DrawerState) => {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setPreviewOpen(true);
    }
  };

  useEffect(() => {
    if (focusedPropertyId) {
      queueMicrotask(() => {
        setSelectedPropertyId(focusedPropertyId);
        if (window.matchMedia("(max-width: 1279px)").matches) {
          setPreviewOpen(true);
        }
      });
    }
  }, [focusedPropertyId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <PageHeader
        actions={
          <>
            {reviewContext && selectedProperty ? (
              <Button
                onClick={() =>
                  openPropertyAction({ mode: "edit", property: selectedProperty })
                }
              >
                <Pencil size={15} />
                Edit selected
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setStatusMessage(null);
                setDrawer({ mode: "create" });
              }}
              variant="primary"
            >
              <Plus size={15} />
              Add property
            </Button>
          </>
        }
        description={
          reviewContext
            ? reviewContext.description
            : "Operational property records with ownership, occupancy, and linked unit performance."
        }
        title="Properties"
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-6">
          <div
            className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-success shadow-sm"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
            <p className="font-medium text-foreground">{statusMessage}</p>
          </div>
        </div>
      ) : null}

      <PropertyFilters
        onDisplayModeChange={setDisplayMode}
        displayMode={displayMode}
        onSelectProperty={previewProperty}
        properties={properties}
        viewQuery={viewQuery}
      />

      {reviewContext ? (
        <PropertyReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
        />
      ) : null}

      <div className="px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:px-6 lg:py-4">
        <div className="grid min-h-0 items-stretch gap-3 lg:h-full xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section
            className={
              isTableMode
                ? "flex min-h-0 min-w-0 flex-col"
                : "min-w-0 space-y-3"
            }
          >
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Portfolio records</p>
                <p className="text-foreground-muted">
                  Select a row to inspect, open a row for the full property file.
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted">
                {pagination.totalCount} total
              </span>
            </div>
            <div className={isTableMode ? "min-h-0 flex-1" : undefined}>
              <PropertiesTable
                displayMode={displayMode}
                onArchiveProperty={(property) =>
                  openPropertyAction({ mode: "archive", property })
                }
                onEditProperty={(property) =>
                  openPropertyAction({ mode: "edit", property })
                }
                onRestoreProperty={(property) =>
                  openPropertyAction({ mode: "restore", property })
                }
                onOpenProperty={openPropertyRecord}
                onSelectProperty={previewProperty}
                properties={properties}
                selectedPropertyId={selectedProperty?.id ?? ""}
              />
            </div>
            <PaginationControls attached={isTableMode} pagination={pagination} />
          </section>
          <aside className="hidden min-h-0 overflow-hidden rounded-md border border-border bg-surface xl:block">
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
          </aside>
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedProperty)}
        title="Property preview"
      >
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
      </RecordPreviewDrawer>

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
      nextStep:
        "Select a property, then choose a current owner in the edit drawer.",
    };
  }

  if (viewQuery.netStatus === "negative") {
    return {
      countLabel: "with negative net income",
      description:
        "Showing properties where active ledger totals are below zero and need income, expense, or occupancy review.",
      nextStep:
        "Select a property, then open its Ledger, Units, or Timeline context from the inspector.",
    };
  }

  return null;
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
