"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, ArrowRight, Pencil, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchiveUnitPanel,
  RestoreUnitPanel,
} from "@/features/units/components/unit-drawer-panels";
import { UnitDetailView } from "@/features/units/components/unit-detail-view";
import { UnitForm } from "@/features/units/components/unit-form";
import type { UnitRecordSection } from "@/features/units/unit-detail-route";
import type {
  UnitDetail,
  UnitPropertyOption,
} from "@/features/units/unit.types";

type DrawerState =
  | { mode: "edit"; unit: UnitDetail }
  | { mode: "archive"; unit: UnitDetail }
  | { mode: "restore"; unit: UnitDetail };

type UnitDetailScreenProps = {
  activeSection: UnitRecordSection;
  propertyOptions: UnitPropertyOption[];
  sourceTaskId?: string;
  unit: UnitDetail;
};

export function UnitDetailScreen({
  activeSection,
  propertyOptions,
  sourceTaskId,
  unit,
}: UnitDetailScreenProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <PageHeader
        actions={
          unit.isArchived ? (
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", unit });
              }}
              variant="primary"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <>
              <Link
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-foreground px-2.5 text-sm font-medium text-background outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={unit.repairAction.href}
                prefetch={false}
              >
                {unit.repairAction.label}
                <ArrowRight size={14} />
              </Link>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "edit", unit });
                }}
              >
                <Pencil size={15} />
                Edit
              </Button>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "archive", unit });
                }}
              >
                <Archive size={15} />
                Archive
              </Button>
            </>
          )
        }
        context={
          <div className="flex items-center gap-2">
            <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
            {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={`${unit.propertyCode} / ${unit.propertyName}`}
        title={`Unit ${unit.unitNumber}`}
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:shrink-0 lg:px-6">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <UnitDetailView
        activeSection={activeSection}
        sourceTaskId={sourceTaskId}
        unit={unit}
      />

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
              key={`edit-${drawer.unit.id}`}
              mode="edit"
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
  if (drawer.mode === "edit") {
    return "Edit unit";
  }

  if (drawer.mode === "restore") {
    return "Restore unit";
  }

  return "Archive unit";
}

function getUnitDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "edit") {
    return "Update the unit profile used by leases, timeline records, and ledger rows.";
  }

  if (drawer.mode === "restore") {
    return "Return this archived unit to normal operational views.";
  }

  return "Hide this unit from active operational views without deleting its history.";
}
