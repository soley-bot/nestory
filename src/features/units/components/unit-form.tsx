"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  createUnitAction,
  type UnitActionState,
  updateUnitAction,
} from "@/features/units/actions";
import type {
  UnitDetail,
  UnitPropertyOption,
  UnitStatusValue,
  UnitSummary,
} from "@/features/units/unit.types";

const initialState: UnitActionState = {};

const statusOptions: { label: string; value: UnitStatusValue }[] = [
  { label: "Vacant", value: "vacant" },
  { label: "Occupied", value: "occupied" },
  { label: "Reserved", value: "reserved" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Inactive", value: "inactive" },
];

type UnitFormProps = {
  mode?: "create" | "edit";
  initialValues?: Partial<Pick<UnitSummary["formValues"], "propertyId">>;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  properties: UnitPropertyOption[];
  unit?: UnitDetail | UnitSummary | null;
};

export function UnitForm({
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
  const selectedStatus = defaults.status || "vacant";
  const normalizedStatusOptions = ensureSelectedStatus(statusOptions, selectedStatus);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Unit saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        {isEditMode && unit ? (
          <input name="unitId" type="hidden" value={unit.id} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
            {isEditMode ? (
              <>
                <input
                  name="propertyId"
                  type="hidden"
                  value={defaults.propertyId}
                />
                <ReadOnlyValue>{propertyLabel}</ReadOnlyValue>
              </>
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
          </Field>

          <Field label="Status" error={state.fieldErrors?.status?.[0]}>
            <SelectControl
              ariaLabel="Status"
              defaultValue={selectedStatus}
              name="status"
              options={normalizedStatusOptions}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_128px_140px]">
          <Field label="Unit number" error={state.fieldErrors?.unitNumber?.[0]}>
            <Input
              defaultValue={defaults.unitNumber}
              name="unitNumber"
              placeholder="12A"
              required
              type="text"
            />
          </Field>

          <Field label="Floor" error={state.fieldErrors?.floor?.[0]}>
            <Input
              defaultValue={defaults.floor}
              name="floor"
              placeholder="12"
              type="text"
            />
          </Field>

          <Field label="Size sqm" error={state.fieldErrors?.sizeSqm?.[0]}>
            <Input
              defaultValue={defaults.sizeSqm}
              min="0"
              name="sizeSqm"
              placeholder="55.25"
              step="0.01"
              type="number"
            />
          </Field>
        </div>

        <div className="grid gap-4">
          <Field
            label="Current rent"
            error={state.fieldErrors?.currentRentAmount?.[0]}
          >
            <Input
              defaultValue={defaults.currentRentAmount}
              min="0"
              name="currentRentAmount"
              placeholder="0.00"
              step="0.01"
              type="number"
            />
          </Field>
        </div>
      </div>

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
            {isEditMode
              ? pending
                ? "Saving..."
                : "Save changes"
              : pending
                ? "Adding..."
                : "Add unit"}
          </Button>
        </div>
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
        className
          ? `block min-w-0 text-sm font-medium ${className}`
          : "block min-w-0 text-sm font-medium"
      }
    >
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center rounded-md border border-border bg-surface-muted px-3 text-sm text-muted">
      {children}
    </div>
  );
}

function getUnitDefaults(
  unit?: UnitDetail | UnitSummary | null,
  initialValues: Partial<Pick<UnitSummary["formValues"], "propertyId">> = {},
) {
  const formValues = unit?.formValues;
  const parsedRent = parseRentLabel(unit?.rentLabel);

  return {
    currentRentAmount: toInputNumber(
      formValues?.currentRentAmount ?? parsedRent.amount,
    ),
    floor:
      formValues?.floor ??
      (unit?.floorLabel && unit.floorLabel !== "Not set" ? unit.floorLabel : ""),
    propertyId:
      formValues?.propertyId ?? unit?.propertyId ?? initialValues.propertyId ?? "",
    sizeSqm: toInputNumber(formValues?.sizeSqm ?? parseSizeLabel(unit)),
    status: formValues?.status ?? normalizeStoredValue(unit?.statusLabel ?? ""),
    unitNumber: formValues?.unitNumber ?? unit?.unitNumber ?? "",
  };
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

function parseRentLabel(label?: string): {
  amount: string;
} {
  if (!label || label === "No rent recorded") {
    return { amount: "" };
  }

  const amount = label.replace(/[^\d.-]/g, "");

  return amount ? { amount } : { amount: "" };
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

function ensureSelectedStatus(
  options: { label: string; value: string }[],
  selectedStatus: string,
) {
  if (!selectedStatus || options.some((option) => option.value === selectedStatus)) {
    return options;
  }

  return [
    ...options,
    { label: selectedStatus.replace(/_/g, " "), value: selectedStatus },
  ];
}
