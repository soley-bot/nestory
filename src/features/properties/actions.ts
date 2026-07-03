"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAssetPhotoAction } from "@/features/photos/actions";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type PropertyFieldErrors = {
  acquisitionDate?: string[];
  address?: string[];
  code?: string[];
  name?: string[];
  notes?: string[];
  owner?: string[];
  ownerPersonId?: string[];
  photo?: string[];
  propertyId?: string[];
  propertyType?: string[];
  status?: string[];
};

export type PropertyActionState = {
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
const postgresUuidSchema = z.guid();
const optionalUuidSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || postgresUuidSchema.safeParse(value).success,
    {
      message: "Choose a valid owner person.",
    },
  );

const propertyMutationSchema = z.object({
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
  propertyType: z
    .string()
    .trim()
    .min(1, "Enter a property type.")
    .max(80, "Keep the type under 80 characters."),
  status: propertyStatusSchema,
});

const propertyIdSchema = z.guid("Choose a property.");

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
    propertyType: readString(formData, "propertyType"),
    status: readString(formData, "status"),
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

function validateInlinePhotoFile(formData: FormData) {
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

  return "";
}

export async function createPropertyAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const context = await requireAdminContext();
  const parsed = propertyMutationSchema.safeParse(
    readPropertyMutationInput(formData),
  );

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const photoError = validateInlinePhotoFile(formData);

  if (photoError) {
    return {
      fieldErrors: { photo: [photoError] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: propertyId, error } = await supabase.rpc("create_property", {
    p_acquisition_date: nullableString(parsed.data.acquisitionDate),
    p_address: nullableString(parsed.data.address),
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_notes: nullableString(parsed.data.notes),
    p_organization_id: context.organizationId,
    p_owner: nullableString(parsed.data.owner),
    p_owner_person_id: nullableString(parsed.data.ownerPersonId),
    p_property_type: parsed.data.propertyType,
    p_status: parsed.data.status,
  });

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
  const context = await requireAdminContext();
  const parsedPropertyId = propertyIdSchema.safeParse(
    readString(formData, "propertyId"),
  );
  const parsed = propertyMutationSchema.safeParse(
    readPropertyMutationInput(formData),
  );

  if (!parsedPropertyId.success) {
    return {
      fieldErrors: { propertyId: ["Choose a property."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const photoError = validateInlinePhotoFile(formData);

  if (photoError) {
    return {
      fieldErrors: { photo: [photoError] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_property", {
    p_acquisition_date: nullableString(parsed.data.acquisitionDate),
    p_address: nullableString(parsed.data.address),
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_notes: nullableString(parsed.data.notes),
    p_organization_id: context.organizationId,
    p_owner: nullableString(parsed.data.owner),
    p_owner_person_id: nullableString(parsed.data.ownerPersonId),
    p_property_id: parsedPropertyId.data,
    p_property_type: parsed.data.propertyType,
    p_status: parsed.data.status,
  });

  if (error) {
    return {
      message: propertyActionErrorMessage(error.message),
      status: "error",
    };
  }

  const photoState = await uploadInlinePropertyPhoto({
    formData,
    isCover: readString(formData, "hasPhoto") !== "true",
    propertyId: parsedPropertyId.data,
  });

  if (photoState?.status === "error") {
    return photoState;
  }

  revalidatePropertyPaths(parsedPropertyId.data);

  return {
    message: photoState
      ? "Property updated and photo uploaded."
      : "Property updated.",
    propertyId: parsedPropertyId.data,
    status: "success",
  };
}

export async function archivePropertyAction(
  _state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  const context = await requireAdminContext();
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
  const context = await requireAdminContext();
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
  if (message.includes("duplicate key")) {
    return "A property with this code already exists.";
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

  return "We could not save the property. Please check the fields and try again.";
}
