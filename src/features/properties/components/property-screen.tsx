"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
  pagination: PropertyPagination;
  properties: PropertySummary[];
  viewQuery: PropertyViewQuery;
};

export function PropertyScreen({
  initialPropertyId,
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
  const [selectedPropertyId, setSelectedPropertyId] = useState(() =>
    getInitialRecordId(properties, initialPropertyId),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedProperty =
    properties.find((property) => property.id === selectedPropertyId) ??
    properties[0] ??
    null;
  const openPropertyRecord = (propertyId: string) => {
    router.push(`/properties/${propertyId}`);
  };

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
    <div className="min-h-screen">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setStatusMessage(null);
              setDrawer({ mode: "create" });
            }}
            variant="primary"
          >
            <Plus size={15} />
            Add property
          </Button>
        }
        description="Operational property records with ownership, occupancy, and linked unit performance."
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
        viewQuery={viewQuery}
      />

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-3">
            <PropertiesTable
              displayMode={displayMode}
              onArchiveProperty={(property) => {
                setStatusMessage(null);
                setDrawer({ mode: "archive", property });
              }}
              onEditProperty={(property) => {
                setStatusMessage(null);
                setDrawer({ mode: "edit", property });
              }}
              onRestoreProperty={(property) => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", property });
              }}
              onOpenProperty={openPropertyRecord}
              onSelectProperty={setSelectedPropertyId}
              properties={properties}
              selectedPropertyId={selectedProperty?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <div className="hidden 2xl:block">
            <PropertyInspector
              onArchiveProperty={(property) => {
                setStatusMessage(null);
                setDrawer({ mode: "archive", property });
              }}
              onEditProperty={(property) => {
                setStatusMessage(null);
                setDrawer({ mode: "edit", property });
              }}
              onRestoreProperty={(property) => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", property });
              }}
              property={selectedProperty}
            />
          </div>
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
              property={drawer.property}
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
