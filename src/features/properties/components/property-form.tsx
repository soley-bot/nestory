"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { Textarea } from "@/components/ui/textarea";
import {
  createPropertyAction,
  type PropertyActionState,
  updatePropertyAction,
} from "@/features/properties/actions";
import type { PropertySummary } from "@/features/properties/data/properties";
import type {
  PropertyFormValues,
  PropertyOwnerOption,
  PropertyStatusValue,
} from "@/features/properties/property.types";

const initialState: PropertyActionState = {};

const statusOptions: { label: string; value: PropertyStatusValue }[] = [
  { label: "Active", value: "active" },
  { label: "Under renovation", value: "under_renovation" },
  { label: "Inactive", value: "inactive" },
];

type PropertyFormProps = {
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string) => void;
  ownerOptions: PropertyOwnerOption[];
  property?: PropertySummary | null;
};

export function PropertyForm({
  mode = "create",
  onClose,
  onSuccess,
  ownerOptions,
  property,
}: PropertyFormProps) {
  const isEditMode = mode === "edit";
  const [state, action, pending] = useActionState(
    isEditMode ? updatePropertyAction : createPropertyAction,
    initialState,
  );
  const defaults = getPropertyDefaults(property);
  const ownerSelectOptions = [
    { label: "No current owner link", value: "" },
    ...ownerOptions.map((owner) => ({
      label: owner.label,
      value: owner.id,
    })),
  ];

  useEffect(() => {
    if (state.status === "success" && isEditMode) {
      onSuccess?.(state.message ?? "Property saved.");
      onClose();
    }
  }, [isEditMode, onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col" encType="multipart/form-data">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        {isEditMode && property ? (
          <input name="propertyId" type="hidden" value={property.id} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_132px]">
          <Field label="Property name" error={state.fieldErrors?.name?.[0]}>
            <Input
              defaultValue={defaults.name}
              name="name"
              placeholder="Central Residence"
              required
              type="text"
            />
          </Field>

          <Field label="Code" error={state.fieldErrors?.code?.[0]}>
            <Input
              defaultValue={defaults.code}
              name="code"
              placeholder="CTR"
              required
              type="text"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Property type"
            error={state.fieldErrors?.propertyType?.[0]}
          >
            <Input
              defaultValue={defaults.propertyType}
              name="propertyType"
              placeholder="Serviced apartment"
              required
              type="text"
            />
          </Field>

          <Field label="Status" error={state.fieldErrors?.status?.[0]}>
            <SelectControl
              ariaLabel="Status"
              defaultValue={defaults.status}
              name="status"
              options={statusOptions}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field
            label="Current owner link"
            error={state.fieldErrors?.ownerPersonId?.[0]}
          >
            <SelectControl
              ariaLabel="Current owner link"
              defaultValue={defaults.ownerPersonId ?? ""}
              name="ownerPersonId"
              options={ownerSelectOptions}
              placeholder="Choose owner"
            />
            {ownerOptions.length === 0 ? (
              <p className="mt-1 text-xs text-muted">
                Add a person before assigning a current owner.
              </p>
            ) : null}
          </Field>

          <Field
            label="Acquisition date"
            error={state.fieldErrors?.acquisitionDate?.[0]}
          >
            <DatePickerField
              ariaLabel="Acquisition date"
              defaultValue={defaults.acquisitionDate ?? ""}
              name="acquisitionDate"
            />
          </Field>
        </div>

        <Field label="Owner display label" error={state.fieldErrors?.owner?.[0]}>
          <Input
            defaultValue={defaults.owner ?? ""}
            name="owner"
            placeholder="Owner group or legal label"
            type="text"
          />
        </Field>

        <Field label="Address" error={state.fieldErrors?.address?.[0]}>
          <Input
            defaultValue={defaults.address ?? ""}
            name="address"
            placeholder="Street, district, city"
            type="text"
          />
        </Field>

        <InlineDocumentField
          defaultCategory="Property evidence"
          error={state.fieldErrors?.document?.[0]}
        />

        <Field label="Notes" error={state.fieldErrors?.notes?.[0]}>
          <Textarea
            defaultValue={defaults.notes ?? ""}
            name="notes"
            placeholder="Internal operating notes"
          />
        </Field>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            {state.status === "success" && !isEditMode ? "Close" : "Cancel"}
          </Button>
          {state.status === "success" && !isEditMode ? null : (
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
                  : "Add property"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function InlineDocumentField({
  defaultCategory,
  error,
}: {
  defaultCategory: string;
  error?: string;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-muted p-3">
      <p className="text-sm font-semibold">Documents and evidence</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Optional. Upload a supporting file and it will be linked to this property.
      </p>
      <input name="documentCategory" type="hidden" value={defaultCategory} />
      <FileDropzoneField
        accept={DOCUMENT_FILE_ACCEPT}
        className="mt-3"
        description="PDF, JPG, PNG, or WebP up to 10 MB."
        name="document"
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </section>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function getPropertyDefaults(
  property?: PropertySummary | null,
): PropertyFormValues {
  return {
    acquisitionDate: property?.formValues.acquisitionDate ?? "",
    address: property?.formValues.address ?? "",
    code: property?.formValues.code ?? "",
    name: property?.formValues.name ?? "",
    notes: property?.formValues.notes ?? "",
    owner: property?.formValues.owner ?? "",
    ownerPersonId: property?.formValues.ownerPersonId ?? "",
    propertyType: property?.formValues.propertyType ?? "",
    status: property?.formValues.status ?? "active",
  };
}
