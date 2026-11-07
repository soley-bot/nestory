"use client";

import Link from "next/link";
import { FinancialReportBoundary } from "@/lib/finance/financial-write-provider";
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
import {
  ArchivePropertyPanel,
  RestorePropertyPanel,
} from "@/features/properties/components/property-drawer-panels";
import { PropertyDetailView } from "@/features/properties/components/property-detail-view";
import { PropertyFormOptions } from "./property-form-options";
import { PropertyForm } from "@/features/properties/components/property-form";
import type { PropertyRecordSection } from "@/features/properties/components/property-detail-view";
import type { PropertyDetail } from "@/features/properties/data/property-detail";
import type { PropertyOwnerOption } from "@/features/properties/property.types";
import { UnitForm } from "@/features/units/components/unit-form";
import { buildHref } from "@/lib/url/href";
import { workflowReturnHref } from "@/features/leases/workflow-return";

type DrawerState =
  | { mode: "edit"; property: PropertyDetail }
  | { mode: "create-unit"; property: PropertyDetail }
  | { mode: "create-lease"; property: PropertyDetail }
  | { mode: "create-document"; property: PropertyDetail };

type ConfirmationState = {
  mode: "archive" | "restore";
  property: PropertyDetail;
};

type PropertyDetailScreenProps = {
  tenantPersonId?: string;
  returnTo?: string;
  billingFormConfig?: LeaseBillingFormConfig;
  canArchive?: boolean;
  canCreateLease?: boolean;
  canRecordDepositReceipt?: boolean;
  canWrite?: boolean;
  initialSection?: Exclude<PropertyRecordSection, "account">;
  ownerOptions?: PropertyOwnerOption[];
  property: PropertyDetail;
  tenantOptions?: LeaseTenantOption[];
};

export function PropertyDetailScreen(props: PropertyDetailScreenProps) {
  const { property } = props;
  return (
    <FinancialReportBoundary expectedGeneration={property.financialGeneration} fallback={
      <>
        <PageHeader title={property.name} description={`${property.code} / ${property.type}`} breadcrumb={
          <PageBreadcrumb current={property.name} items={[{ href: workflowReturnHref(props.returnTo) ?? buildHref("/properties", { tenantPersonId: props.tenantPersonId }), label: "Properties" }]} />
        } />
        <nav aria-label="Property record navigation" className="flex gap-4 px-4 py-3">
          <Link href={property.hrefs.account}>Finance</Link>
          <Link href={property.hrefs.timeline}>View history</Link>
        </nav>
      </>
    }>
      <PropertyDetailScreenContent {...props} />
    </FinancialReportBoundary>
  );
}

function PropertyDetailScreenContent({
  tenantPersonId,
  returnTo,
  billingFormConfig,
  canArchive = true,
  canCreateLease = true,
  canRecordDepositReceipt = false,
  canWrite = true,
  initialSection = "overview",
  ownerOptions,
  property,
  tenantOptions,
}: PropertyDetailScreenProps) {
  const originHref = workflowReturnHref(returnTo);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [ownerAssignmentOpen, setOwnerAssignmentOpen] = useState(false);
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
          property.isArchived && canArchive ? (
            <Button
              ref={confirmationTriggerRef}
              onClick={() => {
                setStatusMessage(null);
                setConfirmation({ mode: "restore", property });
              }}
              variant="default"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : !property.isArchived ? (
            <>
              {canWrite ? (
                <Button
                  onClick={() => {
                    setStatusMessage(null);
                    setDrawer({ mode: "edit", property });
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
                    <Link href={property.hrefs.timeline} prefetch={false}>
                      <History size={15} />
                      View history
                    </Link>
                  </DropdownMenuItem>
                  {canArchive ? <DropdownMenuSeparator /> : null}
                  {canArchive ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        setStatusMessage(null);
                        setConfirmation({ mode: "archive", property });
                      }}
                      variant="destructive"
                    >
                      <Archive size={15} />
                      Archive
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
        breadcrumb={
          <PageBreadcrumb
            current={property.name}
            items={[{ href: originHref ?? buildHref("/properties", { tenantPersonId }), label: "Properties" }]}
          />
        }
        context={
          <div className="flex items-center gap-2">
            <Badge tone={property.statusTone}>{property.status}</Badge>
            {property.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={`${property.code} / ${property.type}`}
        title={property.name}
      />

      {tenantPersonId ? (
        <div className="mx-4 mt-4 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm sm:mx-6">
          <p className="font-medium">Choose where this tenant will lease</p>
          {property.rentalStructure === "single_space" ? (
            canCreateLease && !property.isArchived && property.activeLeases.length === 0 && !property.propertyDraftLease ? (
              <Button className="mt-3" onClick={() => setDrawer({ mode: "create-lease", property })}>
                Create lease for this property
              </Button>
            ) : <p className="mt-2">Lease creation is unavailable for this property.</p>
          ) : property.rentalStructure === "multi_unit" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {property.unitsList.filter((unit) => !unit.isArchived).map((unit) => (
                <Link className="rounded-md border border-border bg-card px-3 py-2 font-medium hover:bg-muted" href={`/units/${unit.id}?${new URLSearchParams({ tenantPersonId })}`} key={unit.id}>
                  Unit {unit.unitNumber}
                </Link>
              ))}
              {property.unitsList.every((unit) => unit.isArchived) ? <p>No active units are available to select.</p> : null}
            </div>
          ) : <p className="mt-2">Set this property’s rental structure before creating a lease.</p>}
        </div>
      ) : null}

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

      <PropertyDetailView
        tenantPersonId={tenantPersonId}
        returnTo={originHref}
        canArchiveFiles={canArchive}
        initialSection={initialSection}
        key={`${property.id}:${initialSection}`}
        onAddDocument={canWrite ? () => {
          setStatusMessage(null);
          setDrawer({ mode: "create-document", property });
        } : undefined}
        onAddUnit={canWrite ? () => {
          setStatusMessage(null);
          setDrawer({ mode: "create-unit", property });
        } : undefined}
        onAssignOwner={canWrite ? () => {
          setStatusMessage(null);
          setOwnerAssignmentOpen(true);
        } : undefined}
        onCreateLease={canCreateLease ? () => {
          setStatusMessage(null);
          setDrawer({ mode: "create-lease", property });
        } : undefined}
        property={property}
      />

      {drawer ? (
        <SideDrawer
          onClose={() => setDrawer(null)}
          open
          title={getPropertyDrawerTitle(drawer)}
        >
          {drawer.mode === "create-unit" ? (
            <UnitForm
              closeOnCreateSuccess
              initialValues={{ propertyId: drawer.property.id }}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={[
                { id: drawer.property.id, label: drawer.property.name },
              ]}
            />
          ) : drawer.mode === "create-lease" ? (
            <PropertyFormOptions
              mode="lease"
              propertyId={drawer.property.id}
              initialOptions={tenantOptions ? { tenants: tenantOptions, billingFormConfig } : undefined}
            >
              {(options) => (
                <LeaseForm
                  initialValues={tenantPersonId ? { tenantPersonId } : undefined}
                  returnTo={`/properties/${property.id}`}
                  billingFormConfig={options.billingFormConfig}
                  canRecordDepositReceipt={canRecordDepositReceipt}
                  createContext={{
                    propertyId: drawer.property.id,
                    propertyLabel: drawer.property.name,
                    unitId: null,
                    unitLabel: null,
                  }}
                  onClose={() => setDrawer(null)}
                  onSuccess={setStatusMessage}
                  properties={[
                    { id: drawer.property.id, label: drawer.property.name },
                  ]}
                  tenants={options.tenants}
                  units={[]}
                />
              )}
            </PropertyFormOptions>
          ) : drawer.mode === "create-document" ? (
            <DocumentForm
              fixedPropertyId={drawer.property.id}
              initialValues={{
                category: "Property record",
                propertyId: drawer.property.id,
              }}
              mode="create"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={[
                { id: drawer.property.id, label: drawer.property.name },
              ]}
              units={drawer.property.unitsList
                .filter((unit) => !unit.isArchived)
                .map((unit) => ({
                  id: unit.id,
                  label: `Unit ${unit.unitNumber}`,
                  propertyId: drawer.property.id,
                }))}
            />
          ) : (
            <PropertyFormOptions
              mode="edit"
              propertyId={drawer.property.id}
              initialOptions={ownerOptions ? { owners: ownerOptions } : undefined}
            >
              {(options) => (
                <PropertyForm
                  key={`edit-${drawer.property.id}`}
                  mode="edit"
                  onClose={() => setDrawer(null)}
                  onSuccess={setStatusMessage}
                  ownerOptions={options.owners}
                  property={drawer.property}
                />
              )}
            </PropertyFormOptions>
          )}
        </SideDrawer>
      ) : null}

      {ownerAssignmentOpen ? (
        <Modal
          onClose={() => setOwnerAssignmentOpen(false)}
          open
          title="Assign owner"
        >
          <PropertyFormOptions
            mode="edit"
            propertyId={property.id}
            initialOptions={ownerOptions ? { owners: ownerOptions } : undefined}
          >
            {(options) => (
              <PropertyForm
                mode="edit"
                onClose={() => setOwnerAssignmentOpen(false)}
                onSuccess={setStatusMessage}
                ownerOptions={options.owners}
                property={property}
                scope="owner"
              />
            )}
          </PropertyFormOptions>
        </Modal>
      ) : null}

      {confirmation ? (
        <Modal
          onClose={closeConfirmation}
          open
          size="compact"
          title={`${confirmation.mode === "archive" ? "Archive" : "Restore"} ${confirmation.property.name}?`}
        >
          {confirmation.mode === "archive" ? (
            <ArchivePropertyPanel
              onClose={closeConfirmation}
              onSuccess={setStatusMessage}
              presentation="modal"
              property={confirmation.property}
            />
          ) : (
            <RestorePropertyPanel
              onClose={closeConfirmation}
              onSuccess={setStatusMessage}
              presentation="modal"
              property={confirmation.property}
            />
          )}
        </Modal>
      ) : null}
    </div>
  );
}
function getPropertyDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create-unit") {
    return "Add unit";
  }

  if (drawer.mode === "create-lease") {
    return "Create lease";
  }

  return drawer.mode === "create-document" ? "Upload document" : "Edit property";
}
