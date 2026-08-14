"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Modal } from "@/components/ui/modal";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchiveLeasePanel,
  RestoreLeasePanel,
} from "@/features/leases/components/lease-drawer-panels";
import { LeaseDetailView } from "@/features/leases/components/lease-detail-view";
import { LeaseForm } from "@/features/leases/components/lease-form";
import {
  transitionLeaseLifecycleAction,
  type LeaseActionState,
} from "@/features/leases/actions";
import type { LeaseRecordSection } from "@/features/leases/lease-detail-route";
import type {
  LeasePropertyOption,
  LeaseSummary,
  LeaseTenantOption,
  LeaseUnitOption,
} from "@/features/leases/lease.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";

type LeaseTransition = "give_notice" | "terminate";

type DrawerState =
  | { mode: "archive" }
  | { mode: "edit" }
  | { mode: "restore" };

const initialActionState: LeaseActionState = {};

export function LeaseDetailScreen({
  activeSection,
  canConfigure,
  lease,
  propertyOptions,
  tenantOptions,
  unitOptions,
}: {
  activeSection: LeaseRecordSection;
  canConfigure: boolean;
  lease: LeaseSummary;
  propertyOptions: LeasePropertyOption[];
  tenantOptions: LeaseTenantOption[];
  unitOptions: LeaseUnitOption[];
}) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [transition, setTransition] = useState<LeaseTransition | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const currentOccupancy =
    lease.occupancies.find((occupancy) => occupancy.evidenceState === "accepted") ??
    lease.occupancies[0] ??
    null;

  const openDrawer = (nextDrawer: DrawerState) => {
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };

  return (
    <div className="lg:flex lg:flex-col">
      <PageHeader
        actions={
          canConfigure ? lease.isArchived ? (
            <Button onClick={() => openDrawer({ mode: "restore" })} variant="default">
              <RotateCcw aria-hidden size={15} /> Restore
            </Button>
          ) : (
            <>
              <Button onClick={() => openDrawer({ mode: "edit" })} variant="default">
                <Pencil aria-hidden size={15} /> Edit lease
              </Button>
              <Button onClick={() => openDrawer({ mode: "archive" })} variant="outline">
                <Archive aria-hidden size={15} /> Archive
              </Button>
            </>
          ) : null
        }
        breadcrumb={
          <PageBreadcrumb current={lease.tenantName} items={[{ href: "/leases", label: "Leases" }]} />
        }
        className="pb-3"
        context={
          <div className="flex items-center gap-2">
            <Badge tone={lease.statusTone}>{lease.statusLabel}</Badge>
            {lease.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={`${lease.propertyName} / ${lease.unitLabel}`}
        title={lease.tenantName}
      />

      {statusMessage ? (
        <div className="workspace-gutter-x pb-3">
          <p className="border-y border-border py-2 text-sm" role="status">
            {statusMessage}
          </p>
        </div>
      ) : null}

      <LeaseDetailView
        activeSection={activeSection}
        canConfigure={canConfigure}
        lease={lease}
        onLifecycleChange={(nextTransition) => {
          setStatusMessage(null);
          if (!currentOccupancy) {
            setStatusMessage(
              "Record current occupancy evidence before changing the lease lifecycle.",
            );
            return;
          }
          setTransition(nextTransition);
        }}
      />

      {drawer ? (
        <SideDrawer
          description={getDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" ? (
            <ArchiveLeasePanel
              lease={lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreLeasePanel
              lease={lease}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <LeaseForm
              key={`edit-${lease.id}`}
              lease={lease}
              mode="edit"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              tenants={tenantOptions}
              units={unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}

      {transition && currentOccupancy ? (
        <LeaseTransitionModal
          lease={lease}
          occupancyId={currentOccupancy.id}
          onClose={() => setTransition(null)}
          onSuccess={(message) => {
            setStatusMessage(message);
            setTransition(null);
          }}
          transition={transition}
        />
      ) : null}
    </div>
  );
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "archive") return "Archive lease";
  if (drawer.mode === "restore") return "Restore lease";
  return "Edit lease";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "archive") return "Archive this record without deleting its history.";
  if (drawer.mode === "restore") return "Review whether this lease can return to active views.";
  return "Update the lease terms, rent, or deposit.";
}

function LeaseTransitionModal({
  lease,
  occupancyId,
  onClose,
  onSuccess,
  transition,
}: {
  lease: LeaseSummary;
  occupancyId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  transition: LeaseTransition;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    transitionLeaseLifecycleAction,
    initialActionState,
  );
  const today = getBusinessDateValue();
  const [idempotencyKey] = useState(
    () => `lease-lifecycle:${lease.id}:${transition}:${crypto.randomUUID()}`,
  );
  const copy = getTransitionCopy(transition);

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? copy.successMessage);
    router.refresh();
  }, [copy.successMessage, onSuccess, router, state.message, state.status]);

  return (
    <Modal onClose={onClose} open title={copy.title}>
      <form action={formAction} className="space-y-4 p-4">
        <input name="leaseId" type="hidden" value={lease.id} />
        <input name="expectedStatus" type="hidden" value={lease.statusValue} />
        <input name="expectedOccupancyId" type="hidden" value={occupancyId} />
        <input name="transition" type="hidden" value={transition} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

        <div className="grid gap-1.5 text-sm font-medium">
          <span>{copy.effectiveDateLabel}</span>
          <DatePickerField
            ariaLabel={copy.effectiveDateLabel}
            defaultValue={today}
            name="effectiveDate"
            required
          />
          <FieldError errors={state.fieldErrors?.effectiveDate} />
        </div>

        {transition === "give_notice" ? (
          <div className="grid gap-1.5 text-sm font-medium">
            <span>Planned move-out date</span>
            <DatePickerField
              ariaLabel="Planned move-out date"
              name="scheduledMoveOutDate"
              required
            />
            <FieldError errors={state.fieldErrors?.scheduledMoveOutDate} />
          </div>
        ) : (
          <input name="scheduledMoveOutDate" type="hidden" value="" />
        )}

        <label className="grid gap-1.5 text-sm font-medium">
          Evidence note
          <textarea
            className="min-h-24 resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
            name="reason"
            required
          />
          <FieldError errors={state.fieldErrors?.reason} />
        </label>

        {state.status === "error" && state.message ? (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? "Saving..." : copy.submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? (
    <span className="text-xs font-normal text-danger">{errors[0]}</span>
  ) : null;
}

function getTransitionCopy(transition: LeaseTransition) {
  return transition === "give_notice"
    ? {
        effectiveDateLabel: "Notice date",
        submitLabel: "Record notice",
        successMessage: "Notice recorded.",
        title: "Record notice",
      }
    : {
        effectiveDateLabel: "Termination date",
        submitLabel: "Terminate lease",
        successMessage: "Lease terminated.",
        title: "Terminate lease",
      };
}
