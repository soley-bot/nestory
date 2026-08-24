"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Archive, History, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
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
import type {
  LeaseBillingFormConfig,
  LeaseTenantOption,
} from "@/features/leases/lease.types";
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
  UnitLeaseDetailsPanel,
  UnitLedgerEntryPanel,
  UnitMaintenanceCasePanel,
} from "@/features/units/components/unit-related-record-panels";
import type { UnitRecordSection } from "@/features/units/unit-detail-route";
import type {
  UnitDetail,
  UnitPropertyOption,
} from "@/features/units/unit.types";
import { formatDate } from "@/lib/dates/format";

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
  billingFormConfig?: LeaseBillingFormConfig;
  canArchive: boolean;
  canRecordDepositReceipt: boolean;
  canWrite: boolean;
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
  billingFormConfig,
  canArchive,
  canRecordDepositReceipt,
  canWrite,
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
          unit.isArchived ? canArchive ? (
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
          ) : null : canWrite || canArchive ? (
            <>
              {canWrite ? (
                <Button
                  onClick={() => {
                    setStatusMessage(null);
                    setDrawer({ mode: "edit", unit });
                  }}
                >
                  <Pencil size={15} />
                  Edit
                </Button>
              ) : null}
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
                  {canArchive ? (
                    <>
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
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
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
            <Badge tone={unit.readiness.lease === "occupied" ? "success" : "neutral"}>
              {unit.readiness.lease === "occupied" ? "Occupied" : "Available"}
              {unit.activeLease ? ` · Lease ends ${formatDate(unit.activeLease.endDate)}` : ""}
            </Badge>
            {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={`${unit.propertyCode} / ${unit.propertyName}`}
        title={`Unit ${unit.unitNumber}`}
      />

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
        canArchiveFiles={canArchive}
        canWriteFiles={canWrite}
        initialSection={activeSection}
        key={`${unit.id}:${activeSection}`}
        onAddDocument={canWrite ? () => {
          setStatusMessage(null);
          setDrawer({ mode: "create-document", unit });
        } : undefined}
        onCreateLease={() => {
          setStatusMessage(null);
          setDrawer({ mode: "create-lease", unit });
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
        <SideDrawer onClose={() => setDrawer(null)} open title="Edit unit">
          <UnitForm
            key={`edit-${drawer.unit.id}`}
            mode="edit"
            onClose={() => setDrawer(null)}
            onSuccess={setStatusMessage}
            properties={propertyOptions}
            unit={drawer.unit}
          />
        </SideDrawer>
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
              billingFormConfig={billingFormConfig}
              canRecordDepositReceipt={canRecordDepositReceipt}
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
          ) : drawer.mode === "lease-detail" ? (
            drawer.unit.activeLease && drawer.unit.hrefs.lease ? (
              <UnitLeaseDetailsPanel
                fullRecordHref={drawer.unit.hrefs.lease}
                lease={drawer.unit.activeLease}
                people={drawer.unit.tenantLinks}
              />
            ) : (
              <div className="space-y-2 p-5">
                <h3 className="font-semibold text-foreground">No current lease</h3>
                <p className="text-sm text-muted-foreground">
                  This unit does not have an active lease to preview. Close this drawer and
                  create a lease from the Lease section.
                </p>
              </div>
            )
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
