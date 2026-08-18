"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CircleHelp, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FileDropzoneField,
  PHOTO_FILE_ACCEPT,
} from "@/components/ui/file-dropzone-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PersonForm } from "@/features/people/components/person-form";
import { PersonSelect } from "@/features/people/components/person-select";
import type { PersonRoleValue } from "@/features/people/people.types";
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

const propertyTypeOptions = [
  { label: "Residential apartment", value: "Residential apartment" },
  { label: "Residential house", value: "Residential house" },
  { label: "Mixed use", value: "Mixed use" },
  { label: "Serviced Apartment", value: "Serviced Apartment" },
  { label: "Condo", value: "Condo" },
];

type PhotoPreview = {
  name: string;
  url: string;
};

type PropertyFormProps = {
  closeOnCreateSuccess?: boolean;
  initialValues?: Partial<Pick<PropertyFormValues, "ownerPersonId">>;
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string, propertyId?: string) => void;
  ownerOptions: PropertyOwnerOption[];
  property?: PropertySummary | null;
  scope?: "all" | "owner";
};

export function PropertyForm({
  closeOnCreateSuccess = false,
  initialValues,
  mode = "create",
  onClose,
  onSuccess,
  ownerOptions,
  property,
  scope = "all",
}: PropertyFormProps) {
  const isEditMode = mode === "edit";
  const isOwnerScope = scope === "owner";
  const [state, action, pending] = useActionState(
    isEditMode ? updatePropertyAction : createPropertyAction,
    initialState,
  );
  const defaults = getPropertyDefaults(property, initialValues);
  const [creationIdempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedOwnerPersonId, setSelectedOwnerPersonId] = useState(
    defaults.ownerPersonId ?? "",
  );
  const [availableOwnerOptions, setAvailableOwnerOptions] = useState(ownerOptions);
  const [createOwnerOpen, setCreateOwnerOpen] = useState(false);
  const [ownershipFactsCleared, setOwnershipFactsCleared] = useState(false);
  const [ownershipFactsKey, setOwnershipFactsKey] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<PhotoPreview | null>(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const openPhotoPickerRef = useRef<(() => void) | null>(null);
  const ownershipShareDefault = selectedOwnerPersonId
    ? ownershipFactsCleared
      ? "100"
      : defaults.ownershipPercent || "100"
    : "";
  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview.url);
      }
    };
  }, [photoPreview]);

  useEffect(() => {
    if (
      state.status === "success" &&
      (isEditMode || closeOnCreateSuccess)
    ) {
      onSuccess?.(
        isOwnerScope ? "Owner assigned." : state.message ?? "Property saved.",
        state.propertyId,
      );
      onClose();
    }
  }, [
    closeOnCreateSuccess,
    isEditMode,
    isOwnerScope,
    onClose,
    onSuccess,
    state.message,
    state.propertyId,
    state.status,
  ]);

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
  const changeOwnerPerson = (nextOwnerPersonId: string) => {
    if (nextOwnerPersonId !== selectedOwnerPersonId) {
      setOwnershipFactsCleared(true);
      setOwnershipFactsKey((key) => key + 1);
    }
    setSelectedOwnerPersonId(nextOwnerPersonId);
  };
  const handleOwnerCreated = (
    personId?: string,
    roles?: PersonRoleValue[],
    displayName?: string,
  ) => {
    if (!personId || !displayName || !roles?.includes("owner")) {
      return;
    }

    setAvailableOwnerOptions((current) => [
      {
        archived: false,
        description: "Owner",
        id: personId,
        label: displayName,
        roles: ["owner"],
      },
      ...current.filter((option) => option.id !== personId),
    ]);
    changeOwnerPerson(personId);
  };

  return (
    <>
      <RecordForm
        action={action}
        ariaLabel={
          isOwnerScope
            ? "Assign owner form"
            : isEditMode
              ? "Edit property form"
              : "Add property form"
        }
        hideSaveOnSuccess={!isEditMode}
        onCancel={onClose}
        pending={pending}
        saveLabel={isOwnerScope ? "Assign owner" : isEditMode ? "Save changes" : "Add property"}
        savingLabel={
          isOwnerScope ? "Assigning owner" : isEditMode ? "Saving property" : "Adding property"
        }
        state={state}
      >
      {state.status === "success" && !isEditMode && state.propertyId ? (
        <CreateSuccessActions propertyId={state.propertyId} />
      ) : null}
      {isEditMode && property ? (
        <input name="propertyId" type="hidden" value={property.id} />
      ) : null}
      {!isEditMode ? (
        <input
          name="idempotencyKey"
          type="hidden"
          value={creationIdempotencyKey}
        />
      ) : null}
      <input
        name="hasPhoto"
        type="hidden"
        value={property?.thumbnailUrl ? "true" : "false"}
      />
      {isEditMode ? (
        <input name="owner" type="hidden" value={defaults.owner ?? ""} />
      ) : null}
      {isEditMode && !isOwnerScope ? (
        <input name="acquisitionDate" type="hidden" value={defaults.acquisitionDate ?? ""} />
      ) : null}

      {isOwnerScope ? (
        <>
          <input name="acquisitionDate" type="hidden" value={defaults.acquisitionDate ?? ""} />
          <input name="address" type="hidden" value={defaults.address ?? ""} />
          <input name="code" type="hidden" value={defaults.code} />
          <input name="name" type="hidden" value={defaults.name} />
          <input name="notes" type="hidden" value={defaults.notes ?? ""} />
          <input name="propertyType" type="hidden" value={defaults.propertyType} />
          <input name="registeredDate" type="hidden" value={defaults.registeredDate ?? ""} />
          <input name="status" type="hidden" value={defaults.status} />
        </>
      ) : null}

      {!isOwnerScope ? (
      <FormSection title="Property">
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
              required
              type="text"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.code?.[0]}
            label="Code"
            name="code"
          >
            <Input
              autoCapitalize="characters"
              defaultValue={defaults.code}
              maxLength={24}
              name="code"
              required={isEditMode}
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
            <SelectControl
              ariaLabel="Property type"
              defaultValue={defaults.propertyType}
              name="propertyType"
              options={getPropertyTypeOptions(defaults.propertyType)}
              placeholder="Select property type"
              required
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.registeredDate?.[0]}
            label="Registered date"
            name="registeredDate"
          >
            <DatePickerField
              ariaLabel="Registered date"
              defaultValue={defaults.registeredDate ?? ""}
              name="registeredDate"
            />
          </RecordField>
        </div>

        {isEditMode ? (
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
        ) : null}

        <RecordField
          error={state.fieldErrors?.address?.[0]}
          label="Address"
          name="address"
        >
          <Input
            defaultValue={defaults.address ?? ""}
            maxLength={240}
            name="address"
            type="text"
          />
        </RecordField>
      </FormSection>
      ) : null}

      {isEditMode ? (
      <FormSection title="Ownership">
        <div className="grid gap-4">
          <RecordField
            label="Property owner"
            name="ownerPersonId"
            error={state.fieldErrors?.ownerPersonId?.[0]}
          >
            <PersonSelect
              allowClear
              context="Property owner"
              name="ownerPersonId"
              onValueChange={changeOwnerPerson}
              options={availableOwnerOptions}
              placeholder="Choose owner"
              preservedOption={
                defaults.ownerPersonId && defaults.owner
                  ? {
                      archived: true,
                      description: "Historical owner link",
                      id: defaults.ownerPersonId,
                      label: defaults.owner,
                      roles: ["owner"],
                    }
                  : undefined
              }
              roles={["owner"]}
              value={selectedOwnerPersonId}
            />
            <div className="mt-1 flex justify-end text-xs">
              <button
                className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
                onClick={() => setCreateOwnerOpen(true)}
                type="button"
              >
                Create owner
              </button>
            </div>
          </RecordField>

        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.ownerStartedOn?.[0]}
            label="Ownership start date"
            name="ownerStartedOn"
            required={Boolean(selectedOwnerPersonId)}
          >
            <DatePickerField
              ariaLabel="Ownership start date"
              defaultValue={ownershipFactsCleared ? "" : defaults.ownerStartedOn ?? ""}
              key={`ownership-start-${ownershipFactsKey}`}
              name="ownerStartedOn"
              required={Boolean(selectedOwnerPersonId)}
            />
          </RecordField>

          <RecordField
            className="[&>div]:relative"
            error={state.fieldErrors?.ownershipPercent?.[0]}
            hint={
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="About ownership share"
                      className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md align-middle text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                    >
                      <CircleHelp aria-hidden="true" className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    className="max-w-64 text-left leading-relaxed"
                    side="top"
                    sideOffset={6}
                  >
                    Use 100% for a sole owner. Reduce the share when the property
                    has multiple owners.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
            label="Ownership share (%)"
            name="ownershipPercent"
            required={Boolean(selectedOwnerPersonId)}
          >
            <Input
              aria-label="Ownership share (%)"
              className="pr-8"
              defaultValue={ownershipShareDefault}
              inputMode="decimal"
              maxLength={7}
              key={`ownership-share-${ownershipFactsKey}`}
              name="ownershipPercent"
              required={Boolean(selectedOwnerPersonId)}
              type="text"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
            >
              %
            </span>
          </RecordField>
        </div>

      </FormSection>
      ) : null}

      {!isOwnerScope ? (
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
      ) : null}

      {isEditMode && !isOwnerScope ? (
      <FormSection title="Notes">
        <RecordField
          className="[&>div]:mt-0 [&>span:first-child]:sr-only"
          error={state.fieldErrors?.notes?.[0]}
          label="Notes"
          name="notes"
        >
          <Textarea
            defaultValue={defaults.notes ?? ""}
            maxLength={800}
            name="notes"
          />
        </RecordField>
      </FormSection>
      ) : null}
      </RecordForm>

      {isEditMode ? (
      <Modal
        description="The new owner will be selected for this property."
        onClose={() => setCreateOwnerOpen(false)}
        open={createOwnerOpen}
        title="Create owner"
      >
        <PersonForm
          createSaveLabel="Create and select"
          initialRoles={["owner"]}
          onClose={() => setCreateOwnerOpen(false)}
          onSuccess={(_message, personId, roles, displayName) =>
            handleOwnerCreated(personId, roles, displayName)
          }
          roleContext="owner"
        />
      </Modal>
      ) : null}
    </>
  );
}

function CreateSuccessActions({ propertyId }: { propertyId: string }) {
  return (
    <div className="rounded-md border border-success/40 bg-success/10 px-3 py-3">
      <p className="text-sm font-semibold text-foreground">Next steps</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          href={`/properties/${propertyId}`}
        >
          Open property record
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
    <section className="rounded-md border border-border bg-muted p-3">
      <FileDropzoneField
        accept={PHOTO_FILE_ACCEPT}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-required={ariaRequired}
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
    <article className="mt-3 overflow-hidden rounded-md border border-accent/50 bg-card">
      <div
        className="relative h-56 bg-muted/50"
        data-slot="property-photo-preview-frame"
      >
        <Image
          alt=""
          className="size-full object-contain p-2"
          fill
          sizes="560px"
          src={preview.url}
          unoptimized
        />
        <button
          aria-label="Cancel selected photo"
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md border border-border bg-card/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
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
          <p className="mt-1 text-xs text-muted-foreground">
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
  initialValues: Partial<Pick<PropertyFormValues, "ownerPersonId">> = {},
): PropertyFormValues {
  return {
    acquisitionDate: property?.formValues.acquisitionDate ?? "",
    address: property?.formValues.address ?? "",
    code: property?.formValues.code ?? "",
    name: property?.formValues.name ?? "",
    notes: property?.formValues.notes ?? "",
    owner: property?.formValues.owner ?? "",
    ownerPersonId:
      property?.formValues.ownerPersonId ?? initialValues.ownerPersonId ?? "",
    ownerStartedOn: property?.formValues.ownerStartedOn ?? "",
    ownershipPercent: property?.formValues.ownershipPercent ?? "",
    propertyType: property?.formValues.propertyType ?? "",
    registeredDate: property?.formValues.registeredDate ?? "",
    status: property?.formValues.status ?? "active",
  };
}

function getPropertyTypeOptions(currentValue: string) {
  if (
    currentValue === "" ||
    propertyTypeOptions.some((option) => option.value === currentValue)
  ) {
    return propertyTypeOptions;
  }

  return [
    { label: currentValue, value: currentValue },
    ...propertyTypeOptions,
  ];
}
