"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAssetPhotoAction } from "@/features/photos/actions";
import { requirePermission, requireWorkspaceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { validateUploadedFileContent } from "@/lib/uploads/upload-content";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

type PropertyFieldErrors = {
  acquisitionDate?: string[];
  address?: string[];
  branchId?: string[];
  code?: string[];
  name?: string[];
  notes?: string[];
  owner?: string[];
  ownerPersonId?: string[];
  ownerStartedOn?: string[];
  ownershipPercent?: string[];
  photo?: string[];
  propertyId?: string[];
  propertyType?: string[];
  registeredDate?: string[];
  rentalStructure?: string[];
  status?: string[];
};

export type PropertyActionState = {
  changed?: boolean;
  fieldErrors?: PropertyFieldErrors;
  message?: string;
  propertyId?: string;
  status?: "error" | "success";
};

const propertyStatusSchema = z.enum([
  "active",
  "under_renovation",
  "inactive",
]);
const ownerPersonIdSchema = postgresUuid("Choose a valid owner person.");
const optionalUuidSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || ownerPersonIdSchema.safeParse(value).success,
    {
      message: "Choose a valid owner person.",
    },
  );

const optionalDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Enter a valid ownership start date.",
  });

const optionalOwnershipPercentSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isValidOwnershipPercent(value),
    "Enter a share greater than 0 and no more than 100 with up to 3 decimals.",
  );

// The database rejects a partial owner/start-date/share trio.
function ownershipTrioRefinement(
  value: {
    ownerPersonId: string;
    ownerStartedOn: string;
    ownershipPercent: string;
  },
  context: z.RefinementCtx,
) {
  if (value.ownerPersonId) {
    if (!value.ownerStartedOn) {
      context.addIssue({
        code: "custom",
        message: "Enter the ownership start date.",
        path: ["ownerStartedOn"],
      });
    }

    if (!value.ownershipPercent) {
      context.addIssue({
        code: "custom",
        message: "Enter the ownership share.",
        path: ["ownershipPercent"],
      });
    }
  } else if (value.ownerStartedOn || value.ownershipPercent) {
    context.addIssue({
      code: "custom",
      message: "Choose an owner for these ownership details.",
      path: ["ownerPersonId"],
    });
  }
}

const propertyCreateSchema = z
  .object({
  address: z.string().trim().max(240, "Keep the address under 240 characters."),
  code: z.string().trim().max(24, "Keep the code under 24 characters."),
  idempotencyKey: z.string().trim().min(8).max(200),
  name: z
    .string()
    .trim()
    .min(1, "Enter a property name.")
    .max(120, "Keep the name under 120 characters."),
  ownerPersonId: optionalUuidSchema,
  ownerStartedOn: optionalDateSchema,
  ownershipPercent: optionalOwnershipPercentSchema,
  propertyType: z
    .string()
    .trim()
    .min(1, "Enter a property type.")
    .max(80, "Keep the type under 80 characters."),
  registeredDate: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Enter a valid registered date.",
    }),
  })
  .superRefine(ownershipTrioRefinement);

const propertyMutationSchema = z
  .object({
  acquisitionDate: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Enter a valid date.",
    }),
  address: z.string().trim().max(240, "Keep the address under 240 characters."),
  code: z
    .string()
    .trim()
    .min(1, "Enter a property code.")
    .max(24, "Keep the code under 24 characters."),
  name: z
    .string()
    .trim()
    .min(1, "Enter a property name.")
    .max(120, "Keep the name under 120 characters."),
  notes: z.string().trim().max(800, "Keep notes under 800 characters."),
  owner: z.string().trim().max(120, "Keep the owner under 120 characters."),
  ownerPersonId: optionalUuidSchema,
  ownerStartedOn: optionalDateSchema,
  ownershipPercent: optionalOwnershipPercentSchema,
  propertyType: z
    .string()
    .trim()
    .min(1, "Enter a property type.")
    .max(80, "Keep the type under 80 characters."),
  registeredDate: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Enter a valid registered date.",
    }),
  status: propertyStatusSchema,
  })
  .superRefine(ownershipTrioRefinement);

const propertyIdSchema = postgresUuid("Choose a property.");
const propertyBranchIdSchema = postgresUuid("Choose a branch.");
const propertyRentalStructureSchema = z.enum(["single_space", "multi_unit"]);

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readPropertyMutationInput(formData: FormData) {
  return {
    acquisitionDate: readString(formData, "acquisitionDate"),
    address: readString(formData, "address"),
    code: readString(formData, "code"),
    name: readString(formData, "name"),
    notes: readString(formData, "notes"),
    owner: readString(formData, "owner"),
    ownerPersonId: readString(formData, "ownerPersonId"),
    ownerStartedOn: readString(formData, "ownerStartedOn"),
    ownershipPercent: readString(formData, "ownershipPercent"),
    propertyType: readString(formData, "propertyType"),
    registeredDate: readString(formData, "registeredDate"),
    status: readString(formData, "status"),
  };
}

function readPropertyCreateInput(formData: FormData) {
  return {
    address: readString(formData, "address"),
    code: readString(formData, "code"),
    idempotencyKey: readString(formData, "idempotencyKey"),
    name: readString(formData, "name"),
    ownerPersonId: readString(formData, "ownerPersonId"),
    ownerStartedOn: readString(formData, "ownerStartedOn"),
    ownershipPercent: readString(formData, "ownershipPercent"),
    propertyType: readString(formData, "propertyType"),
    registeredDate: readString(formData, "registeredDate"),
  };
}

function invalidFormState(error: z.ZodError): PropertyActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as PropertyFieldErrors,
    status: "error",
  };
}

function nullableString(value: string) {
  return value.length > 0 ? value : null;
}

async function validateInlinePhotoFile(formData: FormData) {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    return "";
  }

  if (file.size > 10 * 1024 * 1024) {
    return "Photos must be 10 MB or smaller.";
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Upload a JPG, PNG, or WebP photo.";
  }

  const verifiedFile = await validateUploadedFileContent(file, [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (!verifiedFile.ok) {
    return "Upload a JPG, PNG, or WebP photo.";
  }

  return "";
}

export async function createPropertyAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const context = await requirePermission("properties.write");
  const parsed = propertyCreateSchema.safeParse(readPropertyCreateInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const parsedBranchId = propertyBranchIdSchema.safeParse(
    context.isSuperAdmin
      ? readString(formData, "branchId")
      : context.branchId ?? "",
  );

  if (!parsedBranchId.success) {
    return {
      fieldErrors: {
        branchId: [
          context.isSuperAdmin
            ? "Choose a branch."
            : "Your branch access is unavailable.",
        ],
      },
      status: "error",
    };
  }

  const photoError = await validateInlinePhotoFile(formData);

  if (photoError) {
    return {
      fieldErrors: { photo: [photoError] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const createPayload = {
    p_address: nullableString(parsed.data.address),
    p_code: nullableString(parsed.data.code),
    p_branch_id: parsedBranchId.data,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
    p_property_type: parsed.data.propertyType,
    p_registered_date: nullableString(parsed.data.registeredDate),
    // Ownership travels only when a guided surface collected it.
    ...(parsed.data.ownerPersonId
      ? {
          p_owner_ownership_percent: parsed.data.ownershipPercent,
          p_owner_person_id: parsed.data.ownerPersonId,
          p_owner_started_on: parsed.data.ownerStartedOn,
        }
      : {}),
  };
  const { data: propertyId, error } = await supabase.rpc(
    "create_property_minimal",
    createPayload,
  );

  if (error) {
    return {
      message: propertyActionErrorMessage(error.message),
      status: "error",
    };
  }

  const photoState = await uploadInlinePropertyPhoto({
    formData,
    isCover: true,
    propertyId,
  });

  if (photoState?.status === "error") {
    return {
      message: "Property added, but the photo was not uploaded.",
      propertyId,
      status: "success",
    };
  }

  revalidatePropertyPaths(propertyId);

  return {
    message: photoState ? "Property added and photo uploaded." : "Property added.",
    propertyId,
    status: "success",
  };
}

export async function updatePropertyAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const context = await requireWorkspaceContext();
  if (!context.permissionKeys.has("properties.write")) {
    return {
      message: "You no longer have permission to save this property. Your edits are still here.",
      status: "error",
    };
  }
  const parsedPropertyId = propertyIdSchema.safeParse(
    readString(formData, "propertyId"),
  );
  const parsed = propertyMutationSchema.safeParse(
    readPropertyMutationInput(formData),
  );
  const parsedVersion = postgresUuid("Reopen the property to load its latest version.")
    .safeParse(readString(formData, "expectedVersion"));

  if (!parsedPropertyId.success) {
    return {
      fieldErrors: { propertyId: ["Choose a property."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  if (!parsedVersion.success) {
    return {
      message: "Reopen the property to load its latest version. Your edits have not been saved.",
      status: "error",
    };
  }
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    return {
      message: "Add photos from the property's Files tab after saving these details.",
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await Promise.resolve(supabase.rpc("update_property_details_checked", {
    p_acquisition_date: nullableString(parsed.data.acquisitionDate),
    p_address: nullableString(parsed.data.address),
    p_code: parsed.data.code,
    p_expected_version: parsedVersion.data,
    p_name: parsed.data.name,
    p_notes: nullableString(parsed.data.notes),
    p_organization_id: context.organizationId,
    p_owner: nullableString(parsed.data.owner),
    p_owner_ownership_percent: nullableString(parsed.data.ownershipPercent),
    p_owner_person_id: nullableString(parsed.data.ownerPersonId),
    p_owner_started_on: nullableString(parsed.data.ownerStartedOn),
    p_property_id: parsedPropertyId.data,
    p_property_type: parsed.data.propertyType,
    p_registered_date: nullableString(parsed.data.registeredDate),
    p_status: parsed.data.status,
  })).catch(() => ({ data: null, error: { message: "Save response unavailable" } }));

  if (error) {
    return {
      message: propertyActionErrorMessage(error.message),
      status: "error",
    };
  }

  const result = z.object({
    changed: z.boolean(),
    property_id: postgresUuid("Invalid property response."),
    version: postgresUuid("Invalid property version."),
  }).safeParse(data);
  if (!result.success || result.data.property_id !== parsedPropertyId.data) {
    return {
      message: "We could not confirm the save. Your edits are still here; retry to check or complete it safely.",
      status: "error",
    };
  }

  // A retry can discover that its earlier transaction committed before the
  // response/invalidation arrived. Refresh that recovered state, but keep an
  // unchanged submission from the current version entirely free of invalidation.
  if (result.data.changed || result.data.version !== parsedVersion.data) {
    revalidatePath("/properties");
    revalidatePath(`/properties/${parsedPropertyId.data}`);
    revalidatePath("/overview");
    revalidatePath("/people");
  }

  return {
    changed: result.data.changed,
    message: result.data.changed ? "Property updated." : "No changes to save.",
    propertyId: parsedPropertyId.data,
    status: "success",
  };
}

export async function setPropertyRentalStructureAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const parsedPropertyId = propertyIdSchema.safeParse(
    readString(formData, "propertyId"),
  );
  const parsedStructure = propertyRentalStructureSchema.safeParse(
    readString(formData, "rentalStructure"),
  );

  if (!parsedPropertyId.success) {
    return {
      fieldErrors: { propertyId: ["Choose a property."] },
      status: "error",
    };
  }
  if (!parsedStructure.success) {
    return {
      fieldErrors: { rentalStructure: ["Choose how this property is rented."] },
      status: "error",
    };
  }

  const context = await requirePermission("properties.write");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_property_rental_structure", {
    p_organization_id: context.organizationId,
    p_property_id: parsedPropertyId.data,
    p_rental_structure: parsedStructure.data,
  });

  if (error) {
    return {
      message: propertyRentalStructureErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePropertyPaths(parsedPropertyId.data);
  return {
    message:
      parsedStructure.data === "single_space"
        ? "Whole-property leasing is ready."
        : "Unit setup is ready.",
    propertyId: parsedPropertyId.data,
    status: "success",
  };
}

export async function archivePropertyAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const context = await requirePermission("properties.archive");
  const parsedPropertyId = propertyIdSchema.safeParse(
    readString(formData, "propertyId"),
  );

  if (!parsedPropertyId.success) {
    return {
      fieldErrors: { propertyId: ["Choose a property."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_property", {
    p_organization_id: context.organizationId,
    p_property_id: parsedPropertyId.data,
  });

  if (error) {
    return {
      message: propertyActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePropertyPaths(parsedPropertyId.data);

  return {
    message: "Property archived.",
    status: "success",
  };
}

export async function restorePropertyAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const context = await requirePermission("properties.archive");
  const parsedPropertyId = propertyIdSchema.safeParse(
    readString(formData, "propertyId"),
  );

  if (!parsedPropertyId.success) {
    return {
      fieldErrors: { propertyId: ["Choose a property."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("restore_property", {
    p_organization_id: context.organizationId,
    p_property_id: parsedPropertyId.data,
  });

  if (error) {
    return {
      message: propertyActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePropertyPaths(parsedPropertyId.data);

  return {
    message: "Property restored.",
    status: "success",
  };
}

function revalidatePropertyPaths(propertyId?: string | null) {
  revalidatePath("/overview");
  revalidatePath("/documents");
  revalidatePath("/leases");
  revalidatePath("/people");
  revalidatePath("/properties");
  revalidatePath("/units");
  revalidatePath("/ledger");
  revalidatePath("/timeline");
  revalidatePath("/reports");

  if (propertyId) {
    revalidatePath(`/properties/${propertyId}`);
  }
}

async function uploadInlinePropertyPhoto({
  formData,
  isCover,
  propertyId,
}: {
  formData: FormData;
  isCover: boolean;
  propertyId: string;
}): Promise<PropertyActionState | null> {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const photoFormData = new FormData();
  photoFormData.set("caption", "");
  photoFormData.set("isCover", String(isCover));
  photoFormData.set("photo", file);
  photoFormData.set("propertyId", propertyId);
  photoFormData.set("takenAt", "");
  photoFormData.set("unitId", "");

  const state = await createAssetPhotoAction({}, photoFormData);

  if (state.status === "error") {
    return {
      fieldErrors: {
        photo: state.fieldErrors?.photo,
      },
      message: state.message ?? "Property saved, but the photo was not uploaded.",
      propertyId,
      status: "error",
    };
  }

  return {
    propertyId,
    status: "success",
  };
}

function propertyActionErrorMessage(message: string) {
  if (message.includes("Property changed since this editor was opened")) {
    return "This property changed while you were editing. Your edits are still here. Open the latest property in another tab to compare, then reopen this editor before saving.";
  }

  if (message.includes("Save response unavailable")) {
    return "We could not confirm the save. Your edits are still here; retry to check or complete it safely.";
  }

  if (message.includes("Not authorized")) {
    return "You no longer have permission to save this property. Your edits are still here.";
  }

  if (message.includes("duplicate key")) {
    return "A property with this code already exists.";
  }

  if (message.includes("Property has an open Lease")) {
    return "End or cancel open leases before archiving this property.";
  }

  if (message.includes("Property has active units")) {
    return "Archive or move active units before archiving this property.";
  }

  if (message.includes("Property not found")) {
    return "We could not find that property.";
  }

  if (message.includes("Owner person not found")) {
    return "Choose an active person for the current owner.";
  }

  if (message.includes("Ownership replacement would create an empty interval")) {
    return "Choose a later ownership start date or correct the never-effective owner record first.";
  }

  return "We could not save the property. Please check the fields and try again.";
}

function propertyRentalStructureErrorMessage(message: string) {
  if (message.includes("has_units") || message.includes("active Units")) {
    return "Archive or move active units before changing how this property is rented.";
  }
  if (message.includes("has_unit_leases")) {
    return "Archive the unit leases before changing how this property is rented.";
  }
  if (message.includes("has_property_lease")) {
    return "Archive the whole-property lease before changing how this property is rented.";
  }

  return "We could not change how this property is rented.";
}

function isValidOwnershipPercent(value: string) {
  const match = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(value);

  if (!match) {
    return false;
  }

  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(3, "0"));
  const thousandths = whole * BigInt(1000) + fraction;
  return thousandths > BigInt(0) && thousandths <= BigInt(100000);
}
