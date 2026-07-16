"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import {
  FileDropzoneField,
  PHOTO_FILE_ACCEPT,
} from "@/components/ui/file-dropzone-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
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

type PhotoPreview = {
  name: string;
  url: string;
};

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
  const [photoPreview, setPhotoPreview] = useState<PhotoPreview | null>(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const openPhotoPickerRef = useRef<(() => void) | null>(null);
  const ownerSelectOptions = [
    { label: "No current owner link", value: "" },
    ...ownerOptions.map((owner) => ({
      label: owner.label,
      value: owner.id,
    })),
  ];
  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview.url);
      }
    };
  }, [photoPreview]);

  useEffect(() => {
    if (state.status === "success" && isEditMode) {
      onSuccess?.(state.message ?? "Property saved.");
      onClose();
    }
  }, [isEditMode, onClose, onSuccess, state.message, state.status]);

  const handlePhotoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    setPhotoPreview({
      name: file.name,
      url: URL.createObjectURL(file),
    });
  };
  const clearPhotoPreview = () => {
    setPhotoPreview(null);
    setDropzoneKey((key) => key + 1);
  };
  const changePhotoPreview = () => {
    openPhotoPickerRef.current?.();
  };

  return (
    <RecordForm
      action={action}
      ariaLabel={isEditMode ? "Edit property form" : "Add property form"}
      hideSaveOnSuccess={!isEditMode}
      onCancel={onClose}
      pending={pending}
      saveLabel={isEditMode ? "Save changes" : "Add property"}
      savingLabel={isEditMode ? "Saving property" : "Adding property"}
      state={state}
    >
      {state.status === "success" && !isEditMode && state.propertyId ? (
        <CreateSuccessActions propertyId={state.propertyId} />
      ) : null}
      {isEditMode && property ? (
        <input name="propertyId" type="hidden" value={property.id} />
      ) : null}
      <input
        name="hasPhoto"
        type="hidden"
        value={property?.thumbnailUrl ? "true" : "false"}
      />
      <input name="owner" type="hidden" value={defaults.owner ?? ""} />

      <FormSection title="Identity">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_132px]">
          <RecordField
            error={state.fieldErrors?.name?.[0]}
            label="Property name"
            name="name"
            required
          >
            <Input
              defaultValue={defaults.name}
              maxLength={120}
              name="name"
              placeholder="Central Residence"
              required
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.code?.[0]}
            label="Code"
            name="code"
            required
          >
            <Input
              autoCapitalize="characters"
              defaultValue={defaults.code}
              maxLength={24}
              name="code"
              placeholder="CTR"
              required
              type="text"
            />
          </RecordField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            label="Property type"
            name="propertyType"
            error={state.fieldErrors?.propertyType?.[0]}
            required
          >
            <Input
              defaultValue={defaults.propertyType}
              maxLength={80}
              name="propertyType"
              placeholder="Serviced apartment"
              required
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.status?.[0]}
            label="Status"
            name="status"
            required
          >
            <SelectControl
              ariaLabel="Status"
              defaultValue={defaults.status}
              name="status"
              options={statusOptions}
              required
            />
          </RecordField>
        </div>
      </FormSection>

      <FormSection title="Ownership and location">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <RecordField
            label="Current owner link"
            name="ownerPersonId"
            error={state.fieldErrors?.ownerPersonId?.[0]}
          >
            <SelectControl
              ariaLabel="Current owner link"
              defaultValue={defaults.ownerPersonId ?? ""}
              name="ownerPersonId"
              options={ownerSelectOptions}
              placeholder="Choose owner"
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>
                {ownerOptions.length === 0
                  ? "No owner records are available yet."
                  : "Need a different owner?"}
              </span>
              <Link
                className="font-medium text-accent transition-colors hover:text-accent-hover"
                href="/owners?action=create"
                prefetch={false}
              >
                Create owner
              </Link>
            </div>
          </RecordField>

          <RecordField
            label="Acquisition date"
            name="acquisitionDate"
            error={state.fieldErrors?.acquisitionDate?.[0]}
          >
            <DatePickerField
              ariaLabel="Acquisition date"
              defaultValue={defaults.acquisitionDate ?? ""}
              name="acquisitionDate"
            />
          </RecordField>
        </div>

        <RecordField
          error={state.fieldErrors?.address?.[0]}
          label="Address"
          name="address"
        >
          <Input
            defaultValue={defaults.address ?? ""}
            maxLength={240}
            name="address"
            placeholder="Street, district, city"
            type="text"
          />
        </RecordField>

        <ConsequencePanel
          rows={[
            { label: "Owner link", value: "Updates ownership reporting" },
            { label: "History", value: "Existing property history stays linked" },
          ]}
          summary="Ownership changes update the current relationship without replacing the property record."
          title="Linked record effects"
        />
      </FormSection>

      <FormSection title="Photo">
        <RecordField
          error={state.fieldErrors?.photo?.[0]}
          label="Property photo"
          name="photo"
        >
          <InlinePropertyPhotoField
            dropzoneKey={dropzoneKey}
            onChange={changePhotoPreview}
            onClear={clearPhotoPreview}
            onFile={handlePhotoFile}
            openRef={openPhotoPickerRef}
            preview={photoPreview}
          />
        </RecordField>
      </FormSection>

      <FormSection title="Notes">
        <RecordField
          error={state.fieldErrors?.notes?.[0]}
          label="Internal notes"
          name="notes"
        >
          <Textarea
            defaultValue={defaults.notes ?? ""}
            maxLength={800}
            name="notes"
            placeholder="Internal operating notes"
          />
        </RecordField>
      </FormSection>
    </RecordForm>
  );
}

function CreateSuccessActions({ propertyId }: { propertyId: string }) {
  return (
    <div className="rounded-md border border-success/40 bg-success/10 px-3 py-3">
      <p className="text-sm font-semibold text-foreground">Next steps</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
          href={`/properties/${propertyId}`}
        >
          Open property record
        </Link>
        <Link
          className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
          href={`/units?action=create&propertyId=${propertyId}`}
        >
          Add units
        </Link>
      </div>
    </div>
  );
}

function InlinePropertyPhotoField({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  dropzoneKey,
  onChange,
  onClear,
  onFile,
  openRef,
  preview,
}: {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  dropzoneKey: number;
  onChange: () => void;
  onClear: () => void;
  onFile: (file: File) => void;
  openRef: { current: (() => void) | null };
  preview: PhotoPreview | null;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-muted p-3">
      <p className="mt-1 text-xs leading-5 text-muted">
        Optional. Upload a cover or identification image for the Photos tab.
      </p>
      <FileDropzoneField
        accept={PHOTO_FILE_ACCEPT}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-required={ariaRequired}
        className="mt-3"
        description="JPG, PNG, or WebP up to 10 MB."
        displayFileName={preview?.name}
        key={dropzoneKey}
        name="photo"
        onFile={onFile}
        openRef={openRef}
      />
      {preview ? (
        <SelectedPropertyPhotoPreview
          onChange={onChange}
          onClear={onClear}
          preview={preview}
        />
      ) : null}
    </section>
  );
}

function SelectedPropertyPhotoPreview({
  onChange,
  onClear,
  preview,
}: {
  onChange: () => void;
  onClear: () => void;
  preview: PhotoPreview;
}) {
  return (
    <article className="mt-3 overflow-hidden rounded-md border border-accent/50 bg-surface">
      <div className="relative h-44 bg-surface-muted">
        <Image
          alt=""
          className="size-full object-cover"
          fill
          sizes="560px"
          src={preview.url}
          unoptimized
        />
        <button
          aria-label="Cancel selected photo"
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface/95 text-muted shadow-sm transition-colors hover:text-foreground"
          onClick={onClear}
          type="button"
        >
          <X size={15} />
        </button>
      </div>
      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={preview.name}>
            {preview.name}
          </p>
          <p className="mt-1 text-xs text-muted">
            Preview only. Save the form to upload it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onChange} type="button" variant="secondary">
            <ImageIcon size={14} />
            Change photo
          </Button>
          <Button onClick={onClear} type="button" variant="ghost">
            Cancel upload
          </Button>
        </div>
      </div>
    </article>
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
