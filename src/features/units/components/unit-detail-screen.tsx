"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Archive, History, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { SideDrawer } from "@/components/ui/side-drawer";
import { DocumentForm } from "@/features/documents/components/document-screen";
import { LeaseForm } from "@/features/leases/components/lease-form";
import type { LeaseTenantOption } from "@/features/leases/lease.types";
import { MaintenanceForm } from "@/features/maintenance/components/maintenance-screen";
import type {
  MaintenanceActor,
  MaintenanceAssigneeOption,
  MaintenanceBranchOption,
  MaintenancePropertyOption,
  MaintenanceUnitOption,
  MaintenanceVendorOption,
} from "@/features/maintenance/maintenance.types";
import {
  ArchiveUnitPanel,
  RestoreUnitPanel,
} from "@/features/units/components/unit-drawer-panels";
import { UnitDetailView } from "@/features/units/components/unit-detail-view";
import { UnitForm } from "@/features/units/components/unit-form";
import {
  formatUnitLeaseReadiness,
  formatUnitOperationalReadiness,
} from "@/features/units/data/unit-summary";
import {
  UnitLeaseDetailsPanel,
  UnitLedgerEntryPanel,
  UnitMaintenanceCasePanel,
} from "@/features/units/components/unit-related-record-panels";
import type { UnitRecordSection } from "@/features/units/unit-detail-route";
import type {
  UnitDetail,
  UnitPropertyOption,
} from "@/features/units/unit.types";

type DrawerState =
  | { mode: "edit"; unit: UnitDetail }
  | { mode: "create-document"; unit: UnitDetail }
  | { mode: "create-maintenance"; unit: UnitDetail }
  | { mode: "create-lease"; unit: UnitDetail }
  | { mode: "lease-detail"; unit: UnitDetail }
  | { entry: UnitDetail["recentLedgerEntries"][number]; mode: "ledger-detail" }
  | {
      maintenanceCase: UnitDetail["recentMaintenanceCases"][number];
      mode: "maintenance-detail";
    };

type ConfirmationState = {
  mode: "archive" | "restore";
  unit: UnitDetail;
};

type UnitDetailScreenProps = {
  activeSection: UnitRecordSection;
  maintenanceFormOptions: {
    actor: MaintenanceActor;
    branches: MaintenanceBranchOption[];
    canRecordActualCost: boolean;
    properties: MaintenancePropertyOption[];
    staff: MaintenanceAssigneeOption[];
    units: MaintenanceUnitOption[];
    vendors: MaintenanceVendorOption[];
  };
  propertyOptions: UnitPropertyOption[];
  tenantOptions: LeaseTenantOption[];
  sourceTaskId?: string;
  unit: UnitDetail;
};

export function UnitDetailScreen({
  activeSection,
  maintenanceFormOptions,
  propertyOptions,
  sourceTaskId,
  tenantOptions,
  unit,
}: UnitDetailScreenProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement>(null);

  const closeConfirmation = () => {
    setConfirmation(null);
    window.requestAnimationFrame(() => confirmationTriggerRef.current?.focus());
  };

  return (
    <div className="lg:flex lg:flex-col">
      <PageHeader
        className="px-4 sm:px-6 2xl:px-8"
        actions={
          unit.isArchived ? (
            <Button
              ref={confirmationTriggerRef}
              onClick={() => {
                setStatusMessage(null);
                setConfirmation({ mode: "restore", unit });
              }}
              variant="default"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "edit", unit });
                }}
              >
                <Pencil size={15} />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More"
                    ref={confirmationTriggerRef}
                    variant="outline"
                  >
                    <MoreHorizontal size={16} />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem asChild>
                    <Link href={unit.hrefs.timeline} prefetch={false}>
                      <History size={15} />
                      View history
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setStatusMessage(null);
                      setConfirmation({ mode: "archive", unit });
                    }}
                    variant="destructive"
                  >
                    <Archive size={15} />
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
        breadcrumb={
          <PageBreadcrumb
            current={`Unit ${unit.unitNumber}`}
            items={[
              { href: "/properties", label: "Properties" },
              {
                href: unit.hrefs.property,
                label: `${unit.propertyCode} — ${unit.propertyName}`,
              },
            ]}
          />
        }
        context={
          <div className="flex items-center gap-2">
            <Badge tone="neutral">
              Operational readiness: {formatUnitOperationalReadiness(unit.readiness.operational)}
            </Badge>
            <Badge tone={unit.readiness.lease === "occupied" ? "success" : "neutral"}>
              Lease state: {formatUnitLeaseReadiness(unit.readiness.lease)}
            </Badge>
            {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={`${unit.propertyCode} / ${unit.propertyName}`}
        title={`Unit ${unit.unitNumber}`}
      />

      <section
        aria-label="Unit next action"
        className="mx-4 border-y border-border py-3 sm:mx-6 2xl:mx-8"
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {unit.repairAction.label}
            </p>
          </div>
          {unit.repairAction.label === "Create draft lease" ? (
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawer({ mode: "create-lease", unit });
              }}
              variant="outline"
            >
              {unit.repairAction.label}
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Link
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={unit.repairAction.href}
            >
              {unit.repairAction.label}
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </section>

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:shrink-0 lg:px-6">
          <p
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <UnitDetailView
        initialSection={activeSection}
        key={`${unit.id}:${activeSection}`}
        onAddDocument={() => {
          setStatusMessage(null);
          setDrawer({ mode: "create-document", unit });
        }}
        onNewMaintenanceCase={() => {
          setStatusMessage(null);
          setDrawer({ mode: "create-maintenance", unit });
        }}
        onOpenLease={() => {
          setStatusMessage(null);
          setDrawer({ mode: "lease-detail", unit });
        }}
        onOpenLedgerEntry={(entry) => {
          setStatusMessage(null);
          setDrawer({ entry, mode: "ledger-detail" });
        }}
        onOpenMaintenanceCase={(maintenanceCase) => {
          setStatusMessage(null);
          setDrawer({ maintenanceCase, mode: "maintenance-detail" });
        }}
        sourceTaskId={sourceTaskId}
        unit={unit}
      />

      {drawer?.mode === "edit" ? (
        <Modal
          onClose={() => setDrawer(null)}
          open
          title="Edit unit"
        >
          <UnitForm
            key={`edit-${drawer.unit.id}`}
            mode="edit"
            onClose={() => setDrawer(null)}
            onSuccess={setStatusMessage}
            properties={propertyOptions}
            unit={drawer.unit}
          />
        </Modal>
      ) : drawer ? (
        <SideDrawer
          onClose={() => setDrawer(null)}
          open
          title={getUnitDrawerTitle(drawer)}
        >
          {drawer.mode === "create-document" ? (
            <DocumentForm
              fixedPropertyId={drawer.unit.propertyId}
              fixedUnitId={drawer.unit.id}
              initialValues={{
                category: "Unit record",
                propertyId: drawer.unit.propertyId,
                unitId: drawer.unit.id,
              }}
              mode="create"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions.map((property) => ({
                id: property.id,
                label: property.label,
              }))}
              units={[
                {
                  id: drawer.unit.id,
                  label: `Unit ${drawer.unit.unitNumber}`,
                  propertyId: drawer.unit.propertyId,
                },
              ]}
            />
          ) : drawer.mode === "create-lease" ? (
            <LeaseForm
              createContext={{
                propertyId: drawer.unit.propertyId,
                propertyLabel: drawer.unit.propertyName,
                unitId: drawer.unit.id,
                unitLabel: `Unit ${drawer.unit.unitNumber}`,
              }}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={[
                {
                  id: drawer.unit.propertyId,
                  label: drawer.unit.propertyName,
                },
              ]}
              tenants={tenantOptions}
              units={[
                {
                  id: drawer.unit.id,
                  label: `Unit ${drawer.unit.unitNumber}`,
                  propertyId: drawer.unit.propertyId,
                },
              ]}
            />
          ) : drawer.mode === "create-maintenance" ? (
            <MaintenanceForm
              actor={maintenanceFormOptions.actor}
              branches={maintenanceFormOptions.branches}
              canRecordActualCost={maintenanceFormOptions.canRecordActualCost}
              initialValues={{
                propertyId: drawer.unit.propertyId,
                unitId: drawer.unit.id,
              }}
              mode="create"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={maintenanceFormOptions.properties}
              staff={maintenanceFormOptions.staff}
              units={maintenanceFormOptions.units}
              vendors={maintenanceFormOptions.vendors}
            />
          ) : drawer.mode === "lease-detail" && drawer.unit.activeLease && drawer.unit.hrefs.lease ? (
            <UnitLeaseDetailsPanel
              fullRecordHref={drawer.unit.hrefs.lease}
              lease={drawer.unit.activeLease}
              people={drawer.unit.tenantLinks}
            />
          ) : drawer.mode === "ledger-detail" ? (
            <UnitLedgerEntryPanel entry={drawer.entry} />
          ) : drawer.mode === "maintenance-detail" ? (
            <UnitMaintenanceCasePanel maintenanceCase={drawer.maintenanceCase} />
          ) : null}
        </SideDrawer>
      ) : null}

      {confirmation ? (
        <Modal
          onClose={closeConfirmation}
          open
          size="compact"
          title={`${confirmation.mode === "archive" ? "Archive" : "Restore"} Unit ${confirmation.unit.unitNumber}?`}
        >
          {confirmation.mode === "archive" ? (
            <ArchiveUnitPanel
              onClose={closeConfirmation}
              onSuccess={setStatusMessage}
              presentation="modal"
              unit={confirmation.unit}
            />
          ) : (
            <RestoreUnitPanel
              onClose={closeConfirmation}
              onSuccess={setStatusMessage}
              presentation="modal"
              unit={confirmation.unit}
            />
          )}
        </Modal>
      ) : null}
    </div>
  );
}

function getUnitDrawerTitle(drawer: Exclude<DrawerState, { mode: "edit" }>) {
  if (drawer.mode === "create-document") {
    return "Upload document";
  }

  if (drawer.mode === "create-maintenance") {
    return "New maintenance case";
  }

  if (drawer.mode === "create-lease") {
    return "Create lease";
  }

  if (drawer.mode === "lease-detail") {
    return "Lease details";
  }

  if (drawer.mode === "ledger-detail") {
    return "Ledger entry";
  }

  return "Maintenance case";
}
