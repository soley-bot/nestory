"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createTimelineEventAction,
  type TimelineActionState,
  updateTimelineEventAction,
} from "@/features/timeline/actions";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelinePropertyOption,
  TimelineUnitOption,
} from "@/features/timeline/timeline.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: TimelineActionState = {};

type TimelineEventFormProps = {
  event?: TimelineEvent | null;
  eventTypes: TimelineEventType[];
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string) => void;
  properties: TimelinePropertyOption[];
  units: TimelineUnitOption[];
};

export function TimelineEventForm({
  event,
  eventTypes,
  mode = "create",
  onClose,
  onSuccess,
  properties,
  units,
}: TimelineEventFormProps) {
  const isEditMode = mode === "edit";
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    event?.propertyId ?? "",
  );
  const [selectedUnitId, setSelectedUnitId] = useState(event?.unitId ?? "");
  const [state, action, pending] = useActionState(
    isEditMode ? updateTimelineEventAction : createTimelineEventAction,
    initialState,
  );
  const availableUnits = useMemo(
    () => units.filter((unit) => unit.propertyId === selectedPropertyId),
    [selectedPropertyId, units],
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Timeline event saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="space-y-5 py-5">
      {state.message ? (
        <p
          className="mx-5 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      {isEditMode && event ? (
        <input name="eventId" type="hidden" value={event.id} />
      ) : null}

      <div className="grid grid-cols-2 gap-4 px-5">
        <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            name="propertyId"
            onChange={(changeEvent) => {
              setSelectedPropertyId(changeEvent.target.value);
              setSelectedUnitId("");
            }}
            required
            value={selectedPropertyId}
          >
            <option value="">Select property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            disabled={!selectedPropertyId}
            name="unitId"
            onChange={(changeEvent) => setSelectedUnitId(changeEvent.target.value)}
            value={selectedUnitId}
          >
            <option value="">Property level</option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Event type" error={state.fieldErrors?.eventType?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            defaultValue={event?.eventType ?? eventTypes[0]}
            name="eventType"
            required
          >
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Event date" error={state.fieldErrors?.eventDate?.[0]}>
          <Input
            defaultValue={event?.eventDate ?? ""}
            name="eventDate"
            required
            type="date"
          />
        </Field>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_128px_112px] gap-4 px-5">
        <Field label="Title" error={state.fieldErrors?.title?.[0]}>
          <Input
            defaultValue={event?.title ?? ""}
            name="title"
            placeholder="Short record title"
            required
            type="text"
          />
        </Field>

        <Field label="Cost" error={state.fieldErrors?.costAmount?.[0]}>
          <Input
            defaultValue={event?.cost ?? ""}
            min="0"
            name="costAmount"
            placeholder="0.00"
            step="0.01"
            type="number"
          />
        </Field>

        <Field label="Currency" error={state.fieldErrors?.costCurrency?.[0]}>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            defaultValue={event?.currency ?? ""}
            name="costCurrency"
          >
            <option value="">None</option>
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </select>
        </Field>
      </div>

      <Field
        className="px-5"
        label="Description"
        error={state.fieldErrors?.description?.[0]}
      >
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
          defaultValue={event?.description ?? ""}
          name="description"
          placeholder="Operational notes"
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <Button onClick={onClose} type="button">
          Cancel
        </Button>
        <Button disabled={pending} type="submit" variant="primary">
          {pending
            ? isEditMode
              ? "Saving..."
              : "Adding..."
            : isEditMode
              ? "Save changes"
              : "Add event"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  children,
  className,
  error,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  label: string;
}) {
  return (
    <label className={className ? `block text-sm font-medium ${className}` : "block text-sm font-medium"}>
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}
