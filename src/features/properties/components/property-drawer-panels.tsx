"use client";

import { useActionState, useEffect } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archivePropertyAction,
  type PropertyActionState,
  restorePropertyAction,
} from "@/features/properties/actions";
import type { PropertySummary } from "@/features/properties/data/properties";

const archiveInitialState: PropertyActionState = {};
const restoreInitialState: PropertyActionState = {};

type PropertyPanelProps = {
  onClose: () => void;
  onSuccess: (message: string) => void;
  property: PropertySummary;
};

export function ArchivePropertyPanel({
  onClose,
  onSuccess,
  property,
}: PropertyPanelProps) {
  const [state, action, pending] = useActionState(
    archivePropertyAction,
    archiveInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Property archived.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="propertyId" type="hidden" value={property.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-danger">
          <Archive size={16} />
          <p className="text-sm font-semibold">Archive confirmation</p>
        </div>
        <PropertyPanelSummary property={property} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          This hides the property from active operational views. Active units must
          be archived first, so unit history does not lose its parent context.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Archiving..." : "Archive property"}
        icon={<Archive size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

export function RestorePropertyPanel({
  onClose,
  onSuccess,
  property,
}: PropertyPanelProps) {
  const [state, action, pending] = useActionState(
    restorePropertyAction,
    restoreInitialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Property restored.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="propertyId" type="hidden" value={property.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2 text-accent">
          <RotateCcw size={16} />
          <p className="text-sm font-semibold">Restore confirmation</p>
        </div>
        <PropertyPanelSummary property={property} />
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Restoring makes this property visible in active property workflows again.
        </p>
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore property"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
      />
    </form>
  );
}

function PropertyPanelSummary({ property }: { property: PropertySummary }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
      <p className="text-sm font-medium">{property.name}</p>
      <p className="mt-1 text-sm text-muted">
        {property.code} / {property.type}
      </p>
      <p className="mt-1 text-sm text-muted">{property.unitSummary}</p>
    </div>
  );
}

function PanelMessage({ state }: { state: PropertyActionState }) {
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
