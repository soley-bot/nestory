"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
  pagination: UnitPagination;
  propertyOptions: UnitPropertyOption[];
  units: UnitSummary[];
  viewQuery: UnitViewQuery;
};

export function UnitScreen({
  pagination,
  propertyOptions,
  units,
  viewQuery,
}: UnitScreenProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState(units[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedUnit =
    units.find((unit) => unit.id === selectedUnitId) ?? units[0] ?? null;

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
            Add unit
          </Button>
        }
        description="Operational unit records connected to parent properties, leases, ledger rows, and timeline history."
        title="Units"
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-8">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <UnitFilters properties={propertyOptions} viewQuery={viewQuery} />

      <div className="space-y-3 px-4 py-5 sm:px-6 lg:p-8">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            <UnitsTable
              archiveState={viewQuery.archiveState}
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
              onSelectUnit={setSelectedUnitId}
              selectedUnitId={selectedUnit?.id ?? ""}
              units={units}
            />
            <PaginationControls pagination={pagination} />
          </div>
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
