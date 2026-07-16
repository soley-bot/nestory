"use client";

import { useActionState, useEffect } from "react";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import {
  DOCUMENT_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
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
    if (state.status === "success" && isEditMode) {
      onSuccess?.(state.message ?? "Unit saved.");
      onClose();
    }
  }, [isEditMode, onClose, onSuccess, state.message, state.status]);

  return (
    <RecordForm
      action={action}
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
            error={state.fieldErrors?.status?.[0]}
            label="Status"
            name="status"
            required
          >
            <SelectControl
              ariaLabel="Status"
              defaultValue={selectedStatus}
              name="status"
              options={normalizedStatusOptions}
              required
            />
          </RecordField>
        </div>

        <ConsequencePanel
          rows={[
            {
              label: "Property",
              value: isEditMode ? "Remains on the current property" : "Fixed after creation",
            },
            { label: "Status", value: "Updates vacancy and occupancy views" },
          ]}
          title="Placement effects"
        />
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

      <FormSection title="Rent">
        <div className="grid gap-4">
          <RecordField
            label="Current rent"
            name="currentRentAmount"
            error={state.fieldErrors?.currentRentAmount?.[0]}
          >
            <NumberInput
              defaultValue={defaults.currentRentAmount}
              min="0"
              name="currentRentAmount"
              placeholder="0.00"
              step="0.01"
            />
          </RecordField>
        </div>
      </FormSection>

      <FormSection title="Documents and evidence">
        <RecordField
          error={state.fieldErrors?.document?.[0]}
          label="Supporting file"
          name="document"
        >
          <InlineDocumentField defaultCategory="Unit evidence" />
        </RecordField>
      </FormSection>
    </RecordForm>
  );
}

function InlineDocumentField({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  defaultCategory,
}: {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  defaultCategory: string;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-muted p-3">
      <p className="text-xs leading-5 text-muted">
        Optional. Upload a supporting file and it will be linked to this unit.
      </p>
      <input name="documentCategory" type="hidden" value={defaultCategory} />
      <FileDropzoneField
        accept={DOCUMENT_FILE_ACCEPT}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-required={ariaRequired}
        className="mt-3"
        description="PDF, JPG, PNG, or WebP up to 10 MB."
        name="document"
      />
    </section>
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
