"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FileDropzoneField,
  PHOTO_FILE_ACCEPT,
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
  const flowState = getPropertyFormFlowState({
    isEditMode,
    pending,
    status: state.status,
  });

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
    <form
      action={action}
      className="flex h-full flex-col"
      data-flow-state={flowState}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
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

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_132px]">
          <Field label="Property name" error={state.fieldErrors?.name?.[0]}>
            <Input
              defaultValue={defaults.name}
              maxLength={120}
              name="name"
              placeholder="Central Residence"
              required
              type="text"
            />
          </Field>

          <Field label="Code" error={state.fieldErrors?.code?.[0]}>
            <Input
              autoCapitalize="characters"
              defaultValue={defaults.code}
              maxLength={24}
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
              maxLength={80}
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

        <Field label="Address" error={state.fieldErrors?.address?.[0]}>
          <Input
            defaultValue={defaults.address ?? ""}
            maxLength={240}
            name="address"
            placeholder="Street, district, city"
            type="text"
          />
        </Field>

        <InlinePropertyPhotoField
          dropzoneKey={dropzoneKey}
          error={state.fieldErrors?.photo?.[0]}
          onChange={changePhotoPreview}
          onClear={clearPhotoPreview}
          onFile={handlePhotoFile}
          openRef={openPhotoPickerRef}
          preview={photoPreview}
        />

        <Field label="Notes" error={state.fieldErrors?.notes?.[0]}>
          <Textarea
            defaultValue={defaults.notes ?? ""}
            maxLength={800}
            name="notes"
            placeholder="Internal operating notes"
          />
        </Field>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            {flowState === "created" ? "Close" : "Cancel"}
          </Button>
          {flowState === "created" ? null : (
            <Button
              className="w-full sm:w-auto"
              disabled={pending}
              type="submit"
              variant="primary"
            >
              {getPropertySubmitLabel(flowState, isEditMode)}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

type PropertyFormFlowState = "created" | "editing" | "idle" | "invalid" | "saving";

function getPropertyFormFlowState({
  isEditMode,
  pending,
  status,
}: {
  isEditMode: boolean;
  pending: boolean;
  status?: PropertyActionState["status"];
}): PropertyFormFlowState {
  if (pending) {
    return "saving";
  }

  if (status === "error") {
    return "invalid";
  }

  if (status === "success" && !isEditMode) {
    return "created";
  }

  return isEditMode ? "editing" : "idle";
}

function getPropertySubmitLabel(
  flowState: PropertyFormFlowState,
  isEditMode: boolean,
) {
  if (flowState === "saving") {
    return isEditMode ? "Saving..." : "Adding...";
  }

  return isEditMode ? "Save changes" : "Add property";
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
  dropzoneKey,
  error,
  onChange,
  onClear,
  onFile,
  openRef,
  preview,
}: {
  dropzoneKey: number;
  error?: string;
  onChange: () => void;
  onClear: () => void;
  onFile: (file: File) => void;
  openRef: { current: (() => void) | null };
  preview: PhotoPreview | null;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-muted p-3">
      <p className="text-sm font-semibold">Property photo</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Optional. Upload a cover or identification image for the Photos tab.
      </p>
      <FileDropzoneField
        accept={PHOTO_FILE_ACCEPT}
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
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
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
