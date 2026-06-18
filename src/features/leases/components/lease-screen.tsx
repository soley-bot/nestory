"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchiveLeasePanel,
  RestoreLeasePanel,
} from "@/features/leases/components/lease-drawer-panels";
import { LeaseFilters } from "@/features/leases/components/lease-filters";
import { LeaseForm } from "@/features/leases/components/lease-form";
import { LeaseInspector } from "@/features/leases/components/lease-inspector";
import { LeasesTable } from "@/features/leases/components/leases-table";
import type {
  LeasePagination,
  LeasePropertyOption,
  LeaseSummary,
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

type DrawerState =
  | { lease?: never; mode: "create" }
  | { lease: LeaseSummary; mode: "archive" }
  | { lease: LeaseSummary; mode: "edit" }
  | { lease: LeaseSummary; mode: "restore" };

type LeaseScreenProps = {
  leases: LeaseSummary[];
  pagination: LeasePagination;
  propertyOptions: LeasePropertyOption[];
  unitOptions: LeaseUnitOption[];
  viewQuery: LeaseViewQuery;
};

export function LeaseScreen({
  leases,
  pagination,
  propertyOptions,
  unitOptions,
  viewQuery,
}: LeaseScreenProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [selectedLeaseId, setSelectedLeaseId] = useState(leases[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedLease =
    leases.find((lease) => lease.id === selectedLeaseId) ?? leases[0] ?? null;

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
            Add lease
          </Button>
        }
        description="Operational lease records connected to tenants, units, terms, deposits, and occupancy history."
        title="Leases"
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

      <LeaseFilters properties={propertyOptions} viewQuery={viewQuery} />

      <div className="space-y-3 px-4 py-5 sm:px-6 lg:p-8">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <LeasesTable
              archiveState={viewQuery.archiveState}
              leases={leases}
              onArchiveLease={(lease) => {
                setStatusMessage(null);
                setDrawer({ lease, mode: "archive" });
              }}
              onEditLease={(lease) => {
                setStatusMessage(null);
                setDrawer({ lease, mode: "edit" });
              }}
              onRestoreLease={(lease) => {
                setStatusMessage(null);
                setDrawer({ lease, mode: "restore" });
              }}
              onSelectLease={setSelectedLeaseId}
              selectedLeaseId={selectedLease?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <LeaseInspector
            lease={selectedLease}
            onArchiveLease={(lease) => {
              setStatusMessage(null);
              setDrawer({ lease, mode: "archive" });
            }}
            onEditLease={(lease) => {
              setStatusMessage(null);
              setDrawer({ lease, mode: "edit" });
            }}
            onRestoreLease={(lease) => {
              setStatusMessage(null);
              setDrawer({ lease, mode: "restore" });
            }}
          />
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getLeaseDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getLeaseDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchiveLeasePanel
              lease={drawer.lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreLeasePanel
              lease={drawer.lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <LeaseForm
              key={`${drawer.mode}-${drawer.lease?.id ?? "new"}`}
              lease={drawer.lease}
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              units={unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}
    </div>
  );
}

function getLeaseDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Add lease";
  }

  if (drawer.mode === "edit") {
    return "Edit lease";
  }

  if (drawer.mode === "restore") {
    return "Restore lease";
  }

  return "Archive lease";
}

function getLeaseDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a lease record tied to a tenant, property, optional unit, rent, and deposit.";
  }

  if (drawer.mode === "edit") {
    return "Update the lease terms used across unit, timeline, ledger, and tenant context.";
  }

  if (drawer.mode === "restore") {
    return "Return this archived lease to normal operational views.";
  }

  return "Hide this lease from active operational views without deleting its history.";
}
