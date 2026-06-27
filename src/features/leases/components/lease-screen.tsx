"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  LeaseFormValues,
  LeasePagination,
  LeasePropertyOption,
  LeaseSummary,
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

type LeaseCreateInitialValues = Partial<Pick<LeaseFormValues, "propertyId" | "unitId">>;
type LeaseCreateIntent = "fill-vacancy" | "standard";

type DrawerState =
  | {
      intent?: LeaseCreateIntent;
      initialValues?: LeaseCreateInitialValues;
      lease?: never;
      mode: "create";
    }
  | { lease: LeaseSummary; mode: "archive" }
  | { lease: LeaseSummary; mode: "edit" }
  | { lease: LeaseSummary; mode: "restore" };

type LeaseScreenProps = {
  initialLeaseId?: string;
  leases: LeaseSummary[];
  pagination: LeasePagination;
  propertyOptions: LeasePropertyOption[];
  unitOptions: LeaseUnitOption[];
  viewQuery: LeaseViewQuery;
};

export function LeaseScreen({
  initialLeaseId,
  leases,
  pagination,
  propertyOptions,
  unitOptions,
  viewQuery,
}: LeaseScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createInitialValues = getLeaseCreateInitialValues(
    searchParams,
    propertyOptions,
    unitOptions,
  );
  const createIntent = getLeaseCreateIntent(searchParams, createInitialValues);
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? {
          initialValues: createInitialValues,
          intent: createIntent,
          mode: "create",
        }
      : null,
  );
  const [selectedLeaseId, setSelectedLeaseId] = useState(() =>
    getInitialRecordId(leases, initialLeaseId),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedLease =
    leases.find((lease) => lease.id === selectedLeaseId) ?? leases[0] ?? null;
  const getLeaseRecordHref = (leaseId: string) =>
    getFocusedRecordHref(pathname, searchParams, "leaseId", leaseId);
  const openLeaseRecord = (leaseId: string) => {
    router.push(getLeaseRecordHref(leaseId), { scroll: false });
  };

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

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
            Add lease
          </Button>
        }
        description="Operational lease records connected to tenants, units, terms, deposits, and occupancy history."
        title="Leases"
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-6">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <LeaseFilters properties={propertyOptions} viewQuery={viewQuery} />

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
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
              getLeaseHref={getLeaseRecordHref}
              onOpenLease={openLeaseRecord}
              onSelectLease={setSelectedLeaseId}
              selectedLeaseId={selectedLease?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <div className="hidden 2xl:block">
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
              getLeaseHref={getLeaseRecordHref}
            />
          </div>
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
              initialValues={
                drawer.mode === "create" ? drawer.initialValues : undefined
              }
              key={getLeaseFormKey(drawer)}
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

function getInitialRecordId<TRecord extends { id: string }>(
  records: TRecord[],
  initialId?: string,
) {
  return initialId && records.some((record) => record.id === initialId)
    ? initialId
    : records[0]?.id ?? "";
}

function getFocusedRecordHref(
  pathname: string,
  searchParams: { toString(): string },
  key: string,
  value: string,
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.set(key, value);

  return `${pathname}?${nextParams.toString()}`;
}

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");
  nextParams.delete("source");
  nextParams.delete("unitId");

  const queryString = nextParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function getLeaseCreateIntent(
  searchParams: { get(name: string): string | null },
  initialValues?: LeaseCreateInitialValues,
): LeaseCreateIntent {
  return searchParams.get("source") === "vacancy" && initialValues?.unitId
    ? "fill-vacancy"
    : "standard";
}

function getLeaseCreateInitialValues(
  searchParams: { get(name: string): string | null },
  properties: LeasePropertyOption[],
  units: LeaseUnitOption[],
): LeaseCreateInitialValues | undefined {
  const requestedPropertyId = searchParams.get("propertyId") ?? "";
  const requestedUnitId = searchParams.get("unitId") ?? "";
  const requestedUnit = units.find((unit) => unit.id === requestedUnitId);
  const propertyId =
    requestedUnit?.propertyId ??
    (properties.some((property) => property.id === requestedPropertyId)
      ? requestedPropertyId
      : "");
  const unitId =
    requestedUnit && (!requestedPropertyId || requestedUnit.propertyId === propertyId)
      ? requestedUnit.id
      : "";

  if (!propertyId && !unitId) {
    return undefined;
  }

  return {
    propertyId,
    unitId,
  };
}

function getLeaseFormKey(drawer: Extract<DrawerState, { mode: "create" | "edit" }>) {
  if (drawer.mode === "create") {
    return `create-${drawer.initialValues?.unitId ?? drawer.initialValues?.propertyId ?? "new"}`;
  }

  return `edit-${drawer.lease.id}`;
}

function getLeaseDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    if (drawer.intent === "fill-vacancy") {
      return "Fill vacancy";
    }

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
    if (drawer.intent === "fill-vacancy") {
      return "Create an active lease for the selected vacant unit. Saving the lease will mark the unit occupied.";
    }

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
