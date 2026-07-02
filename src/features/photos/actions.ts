"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type PhotoFieldErrors = {
  caption?: string[];
  photo?: string[];
  photoId?: string[];
  propertyId?: string[];
  takenAt?: string[];
  unitId?: string[];
};

export type PhotoActionState = {
  fieldErrors?: PhotoFieldErrors;
  message?: string;
  status?: "error" | "success";
};

type PhotoPathContext = {
  property_id: string;
  unit_id: string | null;
};

const photoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const postgresUuidSchema = (message: string) =>
  z
    .string()
    .trim()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      message,
    );
const photoIdSchema = postgresUuidSchema("Choose a photo.");
const photoInputSchema = z
  .object({
    caption: z.string().trim().max(180, "Keep the caption under 180 characters."),
    propertyId: postgresUuidSchema("Choose a property."),
    takenAt: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
        message: "Enter a valid date.",
      }),
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    if (
      data.unitId &&
      !postgresUuidSchema("Choose a valid unit.").safeParse(data.unitId).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid unit.",
        path: ["unitId"],
      });
    }
  });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createAssetPhotoAction(
  _state: PhotoActionState,
  formData: FormData,
): Promise<PhotoActionState> {
  const context = await requireAdminContext();
  const parsed = photoInputSchema.safeParse({
    caption: readString(formData, "caption"),
    propertyId: readString(formData, "propertyId"),
    takenAt: readString(formData, "takenAt"),
    unitId: readString(formData, "unitId"),
  });
  const file = formData.get("photo");

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as PhotoFieldErrors,
      message: "Check the photo details and try again.",
      status: "error",
    };
  }

  if (!(file instanceof File) || file.size === 0) {
    return {
      fieldErrors: { photo: ["Choose a photo."] },
      message: "Choose a photo before uploading.",
      status: "error",
    };
  }

  const fileError = validatePhotoFile(file);

  if (fileError) {
    return {
      fieldErrors: { photo: [fileError] },
      message: fileError,
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const unitId = parsed.data.unitId || null;
  const storagePath = getPhotoStoragePath({
    fileName: file.name,
    organizationId: context.organizationId,
    propertyId: parsed.data.propertyId,
    unitId,
  });
  const { error: uploadError } = await supabase.storage
    .from("nestory-photos")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      message: "We could not upload the photo. Please try again.",
      status: "error",
    };
  }

  const { data: photoId, error } = await supabase.rpc("create_asset_photo", {
    p_caption: parsed.data.caption || null,
    p_file_name: file.name,
    p_is_cover: readString(formData, "isCover") === "true",
    p_mime_type: file.type,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_size_bytes: file.size,
    p_storage_path: storagePath,
    p_taken_at: parsed.data.takenAt || null,
    p_unit_id: unitId,
  });

  if (error || !photoId) {
    await supabase.storage.from("nestory-photos").remove([storagePath]);

    return {
      message: photoActionErrorMessage(error?.message ?? ""),
      status: "error",
    };
  }

  revalidatePhotoPaths({
    propertyId: parsed.data.propertyId,
    unitId,
  });

  return {
    message: "Photo uploaded.",
    status: "success",
  };
}

export async function setAssetPhotoCoverAction(formData: FormData) {
  const context = await requireAdminContext();
  const parsedPhotoId = photoIdSchema.safeParse(readString(formData, "photoId"));

  if (!parsedPhotoId.success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getPhotoPathContext(
    supabase,
    context.organizationId,
    parsedPhotoId.data,
  );

  if (!pathContext) {
    return;
  }

  const { error } = await supabase.rpc("set_asset_photo_cover", {
    p_organization_id: context.organizationId,
    p_photo_id: parsedPhotoId.data,
  });

  if (!error) {
    revalidatePhotoPaths({
      propertyId: pathContext.property_id,
      unitId: pathContext.unit_id,
    });
  }
}

export async function archiveAssetPhotoAction(formData: FormData) {
  const context = await requireAdminContext();
  const parsedPhotoId = photoIdSchema.safeParse(readString(formData, "photoId"));

  if (!parsedPhotoId.success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getPhotoPathContext(
    supabase,
    context.organizationId,
    parsedPhotoId.data,
  );

  if (!pathContext) {
    return;
  }

  const { error } = await supabase.rpc("archive_asset_photo", {
    p_organization_id: context.organizationId,
    p_photo_id: parsedPhotoId.data,
  });

  if (!error) {
    revalidatePhotoPaths({
      propertyId: pathContext.property_id,
      unitId: pathContext.unit_id,
    });
  }
}

async function getPhotoPathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  photoId: string,
) {
  const { data } = await supabase
    .from("asset_photos")
    .select("property_id, unit_id")
    .eq("organization_id", organizationId)
    .eq("id", photoId)
    .maybeSingle();

  return data as PhotoPathContext | null;
}

function getPhotoStoragePath({
  fileName,
  organizationId,
  propertyId,
  unitId,
}: {
  fileName: string;
  organizationId: string;
  propertyId: string;
  unitId: string | null;
}) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const scope = unitId ? `units/${unitId}` : `properties/${propertyId}`;

  return `${organizationId}/photos/${scope}/${crypto.randomUUID()}-${safeFileName}`;
}

function validatePhotoFile(file: File) {
  if (file.size > 10 * 1024 * 1024) {
    return "Photos must be 10 MB or smaller.";
  }

  if (!photoMimeTypes.has(file.type)) {
    return "Upload a JPG, PNG, or WebP photo.";
  }

  return "";
}

function revalidatePhotoPaths({
  propertyId,
  unitId,
}: {
  propertyId: string;
  unitId?: string | null;
}) {
  revalidatePath("/overview");
  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/units");

  if (unitId) {
    revalidatePath(`/units/${unitId}`);
  }
}

function photoActionErrorMessage(message: string) {
  if (message.includes("Property not found")) {
    return "Choose an active property before uploading a photo.";
  }

  if (message.includes("Unit not found")) {
    return "Choose an active unit before uploading a photo.";
  }

  if (message.includes("Unit must belong")) {
    return "Choose a unit under the selected property.";
  }

  if (message.includes("violates row-level security")) {
    return "You do not have access to save this photo.";
  }

  return "We could not save the photo. Please check the file and try again.";
}
