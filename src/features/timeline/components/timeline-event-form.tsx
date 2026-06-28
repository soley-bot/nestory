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
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";

const initialState: TimelineActionState = {};

type TimelineEventFormProps = {
  event?: TimelineEvent | null;
  eventTypes: TimelineEventType[];
  initialValues?: Partial<Pick<TimelineEvent, "propertyId" | "unitId">>;
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string) => void;
  properties: TimelinePropertyOption[];
  units: TimelineUnitOption[];
};

export function TimelineEventForm({
  event,
  eventTypes,
  initialValues,
  mode = "create",
  onClose,
  onSuccess,
  properties,
  units,
}: TimelineEventFormProps) {
  const isEditMode = mode === "edit";
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    event?.propertyId ?? initialValues?.propertyId ?? "",
  );
  const [selectedUnitId, setSelectedUnitId] = useState(
    event?.unitId ?? initialValues?.unitId ?? "",
  );
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
          className="mx-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm sm:mx-5"
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      {isEditMode && event ? (
        <input name="eventId" type="hidden" value={event.id} />
      ) : null}

      <div className="grid gap-4 px-4 sm:grid-cols-2 sm:px-5">
        <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
          <SelectControl
            ariaLabel="Property"
            name="propertyId"
            onValueChange={(value) => {
              setSelectedPropertyId(value);
              setSelectedUnitId("");
            }}
            options={[
              { label: "Select property", value: "" },
              ...properties.map((property) => ({
                label: property.label,
                value: property.id,
              })),
            ]}
            required
            value={selectedPropertyId}
          />
        </Field>

        <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
          <SelectControl
            ariaLabel="Unit"
            disabled={!selectedPropertyId}
            name="unitId"
            onValueChange={setSelectedUnitId}
            options={[
              { label: "Property level", value: "" },
              ...availableUnits.map((unit) => ({
                label: unit.label,
                value: unit.id,
              })),
            ]}
            value={selectedUnitId}
          />
        </Field>

        <Field label="Event type" error={state.fieldErrors?.eventType?.[0]}>
          <SelectControl
            ariaLabel="Event type"
            defaultValue={event?.eventType ?? eventTypes[0]}
            name="eventType"
            options={eventTypes.map((eventType) => ({
              label: eventType,
              value: eventType,
            }))}
            required
          />
        </Field>

        <Field label="Event date" error={state.fieldErrors?.eventDate?.[0]}>
          <DatePickerField
            ariaLabel="Event date"
            defaultValue={event?.eventDate ?? ""}
            name="eventDate"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 px-4 sm:grid-cols-[minmax(0,1fr)_128px] sm:px-5">
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
      </div>

      <Field
        className="px-4 sm:px-5"
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

      <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
        <Button className="w-full sm:w-auto" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant="primary"
        >
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
    <label
      className={
        className ? `block min-w-0 text-sm font-medium ${className}` : "block min-w-0 text-sm font-medium"
      }
    >
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}
