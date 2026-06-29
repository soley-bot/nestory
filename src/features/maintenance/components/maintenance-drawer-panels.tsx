"use client";

import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveMaintenanceCaseAction,
  restoreMaintenanceCaseAction,
  type MaintenanceActionState,
} from "@/features/maintenance/actions";
import type { MaintenanceCase } from "@/features/maintenance/maintenance.types";

const archiveInitialState: MaintenanceActionState = {};
const restoreInitialState: MaintenanceActionState = {};

type MaintenancePanelProps = {
  maintenanceCase: MaintenanceCase;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

export function ArchiveMaintenancePanel({
  maintenanceCase,
  onClose,
  onSuccess,
}: MaintenancePanelProps) {
  const [state, action, pending] = useActionState(
    archiveMaintenanceCaseAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Maintenance case archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="taskId" type="hidden" value={maintenanceCase.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-danger">
          <Archive size={16} />
          <p className="text-sm font-semibold">Archive confirmation</p>
        </div>
        <MaintenancePanelSummary maintenanceCase={maintenanceCase} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          This hides the case from active maintenance views while keeping its
          linked timeline, ledger, and document history available.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Archiving..." : "Archive case"}
        icon={<Archive size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

export function RestoreMaintenancePanel({
  maintenanceCase,
  onClose,
  onSuccess,
}: MaintenancePanelProps) {
  const [state, action, pending] = useActionState(
    restoreMaintenanceCaseAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Maintenance case restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="taskId" type="hidden" value={maintenanceCase.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-accent">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <MaintenancePanelSummary maintenanceCase={maintenanceCase} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Restoring makes this case visible in active maintenance workflows again.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore case"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

function MaintenancePanelSummary({
  maintenanceCase,
}: {
  maintenanceCase: MaintenanceCase;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
      <p className="text-sm font-medium">{maintenanceCase.title}</p>
      <p className="mt-1 text-sm text-muted">
        {maintenanceCase.propertyLabel} / {maintenanceCase.unitLabel}
      </p>
      <p className="mt-1 text-sm text-muted">
        {maintenanceCase.statusLabel} / {maintenanceCase.priorityLabel}
      </p>
    </div>
  );
}

function PanelMessage({ state }: { state: MaintenanceActionState }) {
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
