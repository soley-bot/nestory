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
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { Textarea } from "@/components/ui/textarea";

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
  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId,
  );
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Timeline event saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <RecordForm
      action={action}
      ariaLabel={
        isEditMode ? "Edit timeline event form" : "Add timeline event form"
      }
      onCancel={onClose}
      pending={pending}
      saveLabel={isEditMode ? "Save changes" : "Add event"}
      savingLabel={
        isEditMode ? "Saving timeline event" : "Adding timeline event"
      }
      state={{
        ...state,
        fieldErrors: state.fieldErrors ? { ...state.fieldErrors } : undefined,
      }}
    >
      {isEditMode && event ? (
        <input name="eventId" type="hidden" value={event.id} />
      ) : null}

      <ConsequencePanel
        rows={[
          {
            label: "Property",
            value: selectedProperty?.label ?? "Select property",
          },
          {
            label: "Unit",
            value: selectedUnit?.label ?? "Property level",
          },
        ]}
        summary="This selection controls which operating record shows the event. Cost remains timeline context and does not post to the ledger."
        title="Record link"
      />

      <FormSection title="Record link">
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.propertyId?.[0]}
            label="Property"
            name="propertyId"
            required
          >
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
          </RecordField>

          <RecordField
            error={state.fieldErrors?.unitId?.[0]}
            label="Unit"
            name="unitId"
          >
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
          </RecordField>
        </div>
      </FormSection>

      <FormSection title="Event detail">
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.eventType?.[0]}
            label="Event type"
            name="eventType"
            required
          >
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
          </RecordField>

          <RecordField
            error={state.fieldErrors?.eventDate?.[0]}
            label="Event date"
            name="eventDate"
            required
          >
            <DatePickerField
              ariaLabel="Event date"
              defaultValue={event?.eventDate ?? ""}
              name="eventDate"
              required
            />
          </RecordField>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_128px]">
          <RecordField
            error={state.fieldErrors?.title?.[0]}
            label="Title"
            name="title"
            required
          >
            <Input
              defaultValue={event?.title ?? ""}
              name="title"
              placeholder="Short record title"
              required
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.costAmount?.[0]}
            label="Cost"
            name="costAmount"
          >
            <NumberInput
              defaultValue={event?.cost ?? ""}
              min="0"
              name="costAmount"
              placeholder="0.00"
              step="0.01"
            />
          </RecordField>
        </div>
      </FormSection>

      <FormSection title="Notes">
        <RecordField
          error={state.fieldErrors?.description?.[0]}
          label="Description"
          name="description"
        >
          <Textarea
            defaultValue={event?.description ?? ""}
            name="description"
            placeholder="Operational notes"
          />
        </RecordField>
      </FormSection>
    </RecordForm>
  );
}
