"use client";

import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveUnitAction,
  restoreUnitAction,
  type UnitActionState,
} from "@/features/units/actions";
import type { UnitDetail, UnitSummary } from "@/features/units/unit.types";

const archiveInitialState: UnitActionState = {};
const restoreInitialState: UnitActionState = {};

type UnitPanelProps = {
  onClose: () => void;
  onSuccess: (message: string) => void;
  presentation?: "drawer" | "modal";
  unit: UnitDetail | UnitSummary;
};

export function ArchiveUnitPanel({
  onClose,
  onSuccess,
  presentation = "drawer",
  unit,
}: UnitPanelProps) {
  const [state, action, pending] = useActionState(
    archiveUnitAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Unit archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form
      action={action}
      className={presentation === "modal" ? "flex flex-col" : "flex h-full flex-col"}
    >
      <input name="unitId" type="hidden" value={unit.id} />
      <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
        {presentation === "drawer" ? (
          <>
            <div className="flex items-center gap-2 text-danger">
              <Archive size={16} />
              <p className="text-sm font-semibold">Archive confirmation</p>
            </div>
            <UnitPanelSummary unit={unit} />
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              This removes the unit from active views while preserving its records.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            It will leave active unit views. Its records will remain available.
          </p>
        )}
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Archiving..." : "Archive unit"}
        icon={<Archive size={15} />}
        intent="danger"
        onClose={onClose}
        pending={pending}
        presentation={presentation}
      />
    </form>
  );
}

export function RestoreUnitPanel({
  onClose,
  onSuccess,
  presentation = "drawer",
  unit,
}: UnitPanelProps) {
  const [state, action, pending] = useActionState(
    restoreUnitAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Unit restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form
      action={action}
      className={presentation === "modal" ? "flex flex-col" : "flex h-full flex-col"}
    >
      <input name="unitId" type="hidden" value={unit.id} />
      <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
        {presentation === "drawer" ? (
          <>
            <div className="flex items-center gap-2 text-primary">
              <RotateCcw size={16} />
              <p className="text-sm font-semibold">Restore confirmation</p>
            </div>
            <UnitPanelSummary unit={unit} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            It will return to active unit views.
          </p>
        )}
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore unit"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
        presentation={presentation}
      />
    </form>
  );
}

function UnitPanelSummary({ unit }: { unit: UnitDetail | UnitSummary }) {
  return (
    <div className="rounded-md border border-border bg-muted px-3 py-3">
      <p className="text-sm font-medium">Unit {unit.unitNumber}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {unit.propertyCode} / {unit.propertyName}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {unit.statusLabel} / {unit.rentLabel}
      </p>
    </div>
  );
}

function PanelMessage({ state }: { state: UnitActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function PanelFooter({
  confirmLabel,
  icon,
  intent = "default",
  onClose,
  pending,
  presentation = "drawer",
}: {
  confirmLabel: string;
  icon: React.ReactNode;
  intent?: "danger" | "default";
  onClose: () => void;
  pending: boolean;
  presentation?: "drawer" | "modal";
}) {
  return (
    <div
      className={
        presentation === "modal"
          ? "border-t border-border px-4 py-3 sm:px-5"
          : "border-t border-border px-4 py-4 sm:px-5"
      }
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          className="w-full sm:w-auto"
          onClick={onClose}
          type="button"
          variant={presentation === "modal" ? "outline" : "default"}
        >
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant={
            presentation === "modal" && intent === "danger"
              ? "destructive"
              : "default"
          }
        >
          {icon}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
