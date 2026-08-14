"use client";

import Link from "next/link";
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
  presentation?: "drawer" | "modal";
  property: PropertySummary;
};

export function ArchivePropertyPanel({
  onClose,
  onSuccess,
  presentation = "drawer",
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

  const hasActiveUnits = property.units > 0;
  const flowState = getArchiveFlowState({
    blocked: hasActiveUnits,
    pending,
    status: state.status,
  });

  return (
    <form
      action={action}
      className={
        presentation === "modal" ? "flex flex-col" : "flex h-full flex-col"
      }
      data-flow-state={flowState}
    >
      <input name="propertyId" type="hidden" value={property.id} />
      <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
        {presentation === "drawer" ? (
          <>
            <div className="flex items-center gap-2 text-danger">
              <Archive size={16} />
              <p className="text-sm font-semibold">Archive confirmation</p>
            </div>
            <PropertyPanelSummary property={property} />
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              This hides the property from active operational views. Active units must
              be archived first, so unit history does not lose its parent context.
            </p>
          </>
        ) : flowState !== "blocked" ? (
          <p className="text-sm text-muted-foreground">
            It will leave active property views. Its history will remain available.
          </p>
        ) : null}
        {flowState === "blocked" ? (
          <div className="rounded-md border border-warning/40 bg-warning-soft/30 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">
              {presentation === "modal"
                ? `${property.units} active ${property.units === 1 ? "unit" : "units"} must be archived or moved first.`
                : "Archive or move active units before archiving this property."}
            </p>
            <Link
              className="mt-2 inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              href={`/units?propertyId=${property.id}`}
            >
              Review active units
            </Link>
          </div>
        ) : null}
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Archiving..." : "Archive property"}
        disabled={flowState === "blocked"}
        icon={<Archive size={15} />}
        intent="danger"
        onClose={onClose}
        pending={pending}
        presentation={presentation}
      />
    </form>
  );
}

export function RestorePropertyPanel({
  onClose,
  onSuccess,
  presentation = "drawer",
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
    <form
      action={action}
      className={
        presentation === "modal" ? "flex flex-col" : "flex h-full flex-col"
      }
    >
      <input name="propertyId" type="hidden" value={property.id} />
      <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
        {presentation === "drawer" ? (
          <>
            <div className="flex items-center gap-2 text-primary">
              <RotateCcw size={16} />
              <p className="text-sm font-semibold">Restore confirmation</p>
            </div>
            <PropertyPanelSummary property={property} />
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              Restoring returns this property to active property lists.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            It will return to active property views.
          </p>
        )}
        <PanelMessage state={state} />
      </div>

      <PanelFooter
        confirmLabel={pending ? "Restoring..." : "Restore property"}
        icon={<RotateCcw size={15} />}
        onClose={onClose}
        pending={pending}
        presentation={presentation}
      />
    </form>
  );
}

type ArchiveFlowState = "blocked" | "confirming" | "failed" | "saving";

function getArchiveFlowState({
  blocked,
  pending,
  status,
}: {
  blocked: boolean;
  pending: boolean;
  status?: PropertyActionState["status"];
}): ArchiveFlowState {
  if (blocked) {
    return "blocked";
  }

  if (pending) {
    return "saving";
  }

  if (status === "error") {
    return "failed";
  }

  return "confirming";
}

function PropertyPanelSummary({ property }: { property: PropertySummary }) {
  return (
    <div className="rounded-md border border-border bg-muted px-3 py-3">
      <p className="text-sm font-medium">{property.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {property.code} / {property.type}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{property.unitSummary}</p>
    </div>
  );
}

function PanelMessage({ state }: { state: PropertyActionState }) {
  const message = state.message ?? state.fieldErrors?.propertyId?.[0];

  if (!message) {
    return null;
  }

  return (
    <p
      className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
      role={state.status === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function PanelFooter({
  confirmLabel,
  disabled = false,
  icon,
  intent = "default",
  onClose,
  pending,
  presentation = "drawer",
}: {
  confirmLabel: string;
  disabled?: boolean;
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
          disabled={pending || disabled}
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
