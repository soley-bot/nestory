"use client";

import { useActionState, useEffect, useState } from "react";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import {
  createUnitAction,
  type UnitActionState,
  updateUnitAction,
} from "@/features/units/actions";
import {
  UNIT_OPERATIONAL_STATE_OPTIONS,
  type UnitDetail,
  type UnitOperationalStateValue,
  type UnitPropertyOption,
  type UnitSummary,
} from "@/features/units/unit.types";

const initialState: UnitActionState = {};

type UnitFormProps = {
  closeOnCreateSuccess?: boolean;
  mode?: "create" | "edit";
  initialValues?: Partial<Pick<UnitSummary["formValues"], "propertyId">>;
  onClose: () => void;
  onSuccess?: (message: string, unitId?: string) => void;
  properties: UnitPropertyOption[];
  unit?: UnitDetail | UnitSummary | null;
};

export function UnitForm({
  closeOnCreateSuccess = false,
  initialValues,
  mode = "create",
  onClose,
  onSuccess,
  properties,
  unit,
}: UnitFormProps) {
  const isEditMode = mode === "edit";
  const [state, action, pending] = useActionState(
    isEditMode ? updateUnitAction : createUnitAction,
    initialState,
  );
  const defaults = getUnitDefaults(unit, initialValues);
  const propertyOptions = ensureSelectedProperty(properties, defaults.propertyId);
  const propertyLabel = getPropertyLabel(propertyOptions, defaults.propertyId);
  const operationalStateLocked = Boolean(isEditMode && unit?.hasActiveLease);
  const [selectedOperationalState, setSelectedOperationalState] = useState(
    defaults.operationalState,
  );

  useEffect(() => {
    if (
      state.status === "success" &&
      (isEditMode || closeOnCreateSuccess)
    ) {
      onSuccess?.(state.message ?? "Unit saved.", state.unitId);
      onClose();
    }
  }, [
    closeOnCreateSuccess,
    isEditMode,
    onClose,
    onSuccess,
    state.message,
    state.status,
    state.unitId,
  ]);

  return (
    <RecordForm
      action={action}
      allowSaveWhenClean={!isEditMode}
      ariaLabel={isEditMode ? "Edit unit form" : "Add unit form"}
      hideSaveOnSuccess={!isEditMode}
      onCancel={onClose}
      pending={pending}
      saveLabel={isEditMode ? "Save changes" : "Add unit"}
      savingLabel={isEditMode ? "Saving unit" : "Adding unit"}
      state={state}
    >
      {isEditMode && unit ? (
        <input name="unitId" type="hidden" value={unit.id} />
      ) : null}

      <FormSection title="Placement">
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            className="sm:col-span-2"
            error={state.fieldErrors?.propertyId?.[0]}
            label="Property"
            name="propertyId"
            required
          >
            {isEditMode ? (
              <ReadOnlyValue>{propertyLabel}</ReadOnlyValue>
            ) : (
              <SelectControl
                ariaLabel="Property"
                defaultValue={defaults.propertyId}
                name="propertyId"
                options={[
                  { label: "Select property", value: "" },
                  ...propertyOptions.map((property) => ({
                    label: property.label,
                    value: property.id,
                  })),
                ]}
                required
              />
            )}
            {isEditMode ? (
              <input
                name="propertyId"
                type="hidden"
                value={defaults.propertyId}
              />
            ) : null}
          </RecordField>

          <RecordField
            label="Occupancy"
            name="occupancy"
          >
            <ReadOnlyValue>{defaults.occupancy}</ReadOnlyValue>
          </RecordField>

          <RecordField
            error={state.fieldErrors?.operationalState?.[0]}
            label="Operational state"
            name="operationalState"
            required={!operationalStateLocked}
          >
            {operationalStateLocked ? (
              <ReadOnlyValue>
                {getOperationalStateLabel(defaults.operationalState)}
              </ReadOnlyValue>
            ) : (
              <SelectControl
                ariaLabel="Operational state"
                defaultValue={defaults.operationalState}
                name="operationalState"
                onValueChange={(value) =>
                  setSelectedOperationalState(value as UnitOperationalStateValue)
                }
                options={UNIT_OPERATIONAL_STATE_OPTIONS}
                required
              />
            )}
          </RecordField>
          {operationalStateLocked ? (
            <input
              name="operationalState"
              type="hidden"
              value={defaults.operationalState}
            />
          ) : null}
        </div>

        {!isEditMode ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium text-foreground">Lease readiness</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {getNewUnitReadinessCopy(selectedOperationalState)}
            </p>
          </div>
        ) : null}

      </FormSection>

      <FormSection title="Unit details">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_128px_140px]">
          <RecordField
            error={state.fieldErrors?.unitNumber?.[0]}
            label="Unit number"
            name="unitNumber"
            required
          >
            <Input
              defaultValue={defaults.unitNumber}
              name="unitNumber"
              placeholder="12A"
              required
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.floor?.[0]}
            label="Floor"
            name="floor"
          >
            <Input
              defaultValue={defaults.floor}
              name="floor"
              placeholder="12"
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.sizeSqm?.[0]}
            label="Size sqm"
            name="sizeSqm"
          >
            <NumberInput
              defaultValue={defaults.sizeSqm}
              min="0"
              name="sizeSqm"
              placeholder="55.25"
              step="0.01"
            />
          </RecordField>
        </div>
      </FormSection>

    </RecordForm>
  );
}

function ReadOnlyValue({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className="flex min-h-9 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

function getUnitDefaults(
  unit?: UnitDetail | UnitSummary | null,
  initialValues: Partial<Pick<UnitSummary["formValues"], "propertyId">> = {},
) {
  const formValues = unit?.formValues;
  const storedStatus =
    formValues?.status ?? normalizeStoredValue(unit?.statusLabel ?? "");

  return {
    floor:
      formValues?.floor ??
      (unit?.floorLabel && unit.floorLabel !== "Not set" ? unit.floorLabel : ""),
    propertyId:
      formValues?.propertyId ?? unit?.propertyId ?? initialValues.propertyId ?? "",
    sizeSqm: toInputNumber(formValues?.sizeSqm ?? parseSizeLabel(unit)),
    occupancy: unit?.occupancyLabel ?? "Vacant",
    operationalState: getOperationalState(storedStatus),
    unitNumber: formValues?.unitNumber ?? unit?.unitNumber ?? "",
  };
}
function getOperationalState(storedStatus: string): UnitOperationalStateValue {
  return storedStatus === "maintenance" || storedStatus === "inactive"
    ? storedStatus
    : "active";
}

function getNewUnitReadinessCopy(value: UnitOperationalStateValue) {
  switch (value) {
    case "maintenance":
      return "Blocked from leasing until maintenance is resolved.";
    case "inactive":
      return "Not available for leasing while inactive.";
    case "active":
      return "Available for leasing after save. A Lease will determine occupancy.";
  }
}

function getOperationalStateLabel(value: string) {
  return (
    UNIT_OPERATIONAL_STATE_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

function toInputNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value);
}

function parseSizeLabel(unit?: UnitDetail | UnitSummary | null) {
  if (!unit || !("sizeLabel" in unit)) {
    return "";
  }

  const match = unit.sizeLabel.match(/^([\d,.]+)/);
  return match?.[1]?.replace(/,/g, "") ?? "";
}

function normalizeStoredValue(value: string) {
  return value.trim().toLowerCase().replace(/[_\s-]+/g, "_");
}

function getPropertyLabel(
  properties: UnitPropertyOption[],
  selectedPropertyId: string,
) {
  return (
    properties.find((property) => property.id === selectedPropertyId)?.label ??
    "Current property"
  );
}

function ensureSelectedProperty(
  properties: UnitPropertyOption[],
  selectedPropertyId: string,
) {
  if (
    !selectedPropertyId ||
    properties.some((property) => property.id === selectedPropertyId)
  ) {
    return properties;
  }

  return [
    ...properties,
    { id: selectedPropertyId, label: "Current property" },
  ];
}
