"use client";

import { useState } from "react";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchivePropertyPanel,
  RestorePropertyPanel,
} from "@/features/properties/components/property-drawer-panels";
import { PropertyDetailView } from "@/features/properties/components/property-detail-view";
import { PropertyForm } from "@/features/properties/components/property-form";
import type { PropertyDetail } from "@/features/properties/data/property-detail";
import type { PropertyOwnerOption } from "@/features/properties/property.types";

type DrawerState =
  | { mode: "edit"; property: PropertyDetail }
  | { mode: "archive"; property: PropertyDetail }
  | { mode: "restore"; property: PropertyDetail };

type PropertyDetailScreenProps = {
  ownerOptions: PropertyOwnerOption[];
  property: PropertyDetail;
};

export function PropertyDetailScreen({
  ownerOptions,
  property,
}: PropertyDetailScreenProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <PageHeader
        actions={
          property.isArchived ? (
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", property });
              }}
              variant="primary"
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
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "archive", property });
                }}
              >
                <Archive size={15} />
                Archive
              </Button>
            </>
          )
        }
        description={`${property.code} / ${property.type} / ${
          property.isArchived ? "Archived" : property.status
        }`}
        title={property.name}
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

      <PropertyDetailView property={property} />

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
    </div>
  );
}

function getPropertyDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "edit") {
    return "Edit property";
  }

  if (drawer.mode === "restore") {
    return "Restore property";
  }

  return "Archive property";
}

function getPropertyDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "edit") {
    return "Update the property profile used by units, owners, timeline, and ledger rows.";
  }

  if (drawer.mode === "restore") {
    return "Return this archived property to normal operational views.";
  }

  return "Hide this property from active operational views without deleting its history.";
}
