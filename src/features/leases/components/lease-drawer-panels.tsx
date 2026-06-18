"use client";

import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveLeaseAction,
  type LeaseActionState,
  restoreLeaseAction,
} from "@/features/leases/actions";
import type { LeaseSummary } from "@/features/leases/lease.types";

const archiveInitialState: LeaseActionState = {};
const restoreInitialState: LeaseActionState = {};

type LeasePanelProps = {
  lease: LeaseSummary;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

export function ArchiveLeasePanel({
  lease,
  onClose,
  onSuccess,
}: LeasePanelProps) {
  const [state, action, pending] = useActionState(
    archiveLeaseAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Lease archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="leaseId" type="hidden" value={lease.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-danger">
          <Archive size={16} />
          <p className="text-sm font-semibold">Archive confirmation</p>
        </div>
        <LeasePanelSummary lease={lease} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          This removes the lease from normal active views while preserving tenant,
          unit, rent, deposit, and move history for audit.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Archiving..." : "Archive lease"}
        icon={<Archive size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

export function RestoreLeasePanel({
  lease,
  onClose,
  onSuccess,
}: LeasePanelProps) {
  const [state, action, pending] = useActionState(
    restoreLeaseAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Lease restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="leaseId" type="hidden" value={lease.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-accent">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <LeasePanelSummary lease={lease} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Restoring makes this lease visible in normal operational views again.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore lease"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

function LeasePanelSummary({ lease }: { lease: LeaseSummary }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
      <p className="text-sm font-medium">{lease.tenantName}</p>
      <p className="mt-1 text-sm text-muted">
        {lease.propertyCode} / {lease.unitLabel}
      </p>
      <p className="mt-1 text-sm text-muted">
        {lease.termLabel} / {lease.rentLabel}
      </p>
    </div>
  );
}

function PanelMessage({ state }: { state: LeaseActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function PanelFooter({
  confirmLabel,
  icon,
  onClose,
  pending,
}: {
  confirmLabel: string;
  icon: React.ReactNode;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <div className="border-t border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant="primary"
        >
          {icon}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
