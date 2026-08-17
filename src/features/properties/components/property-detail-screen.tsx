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
import type { LeaseTenantOption } from "@/features/leases/lease.types";
import {
  ArchivePropertyPanel,
  RestorePropertyPanel,
} from "@/features/properties/components/property-drawer-panels";
import { PropertyDetailView } from "@/features/properties/components/property-detail-view";
import { PropertyForm } from "@/features/properties/components/property-form";
import type { PropertyRecordSection } from "@/features/properties/components/property-detail-view";
import type { PropertyDetail } from "@/features/properties/data/property-detail";
import type { PropertyOwnerOption } from "@/features/properties/property.types";
import { UnitForm } from "@/features/units/components/unit-form";

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
  initialSection?: Exclude<PropertyRecordSection, "account">;
  ownerOptions: PropertyOwnerOption[];
  property: PropertyDetail;
  tenantOptions: LeaseTenantOption[];
};

export function PropertyDetailScreen({
  initialSection = "overview",
  ownerOptions,
  property,
  tenantOptions,
}: PropertyDetailScreenProps) {
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
          property.isArchived ? (
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
          ) : (
            <>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "edit", property });
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
                    <Link href={property.hrefs.timeline} prefetch={false}>
                      <History size={15} />
                      View history
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
        breadcrumb={
          <PageBreadcrumb
            current={property.name}
            items={[{ href: "/properties", label: "Properties" }]}
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
        initialSection={initialSection}
        key={`${property.id}:${initialSection}`}
        onAddDocument={() => {
          setStatusMessage(null);
          setDrawer({ mode: "create-document", property });
        }}
        onAddUnit={() => {
          setStatusMessage(null);
          setDrawer({ mode: "create-unit", property });
        }}
        onCreateLease={() => {
          setStatusMessage(null);
          setDrawer({ mode: "create-lease", property });
        }}
        property={property}
      />

      {drawer ? (
        <SideDrawer
          description={getPropertyDrawerDescription(drawer)}
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
            <LeaseForm
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
              tenants={tenantOptions}
              units={[]}
            />
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
            <PropertyForm
              key={`edit-${drawer.property.id}`}
              mode="edit"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              ownerOptions={ownerOptions}
              property={drawer.property}
            />
          )}
        </SideDrawer>
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

function getPropertyDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create-unit") {
    return `Add a unit to ${drawer.property.name}.`;
  }

  if (drawer.mode === "create-lease") {
    return `Create a draft lease for ${drawer.property.name}.`;
  }

  return drawer.mode === "create-document"
    ? undefined
    : "Update the property profile used by units, owners, timeline, and ledger rows.";
}
