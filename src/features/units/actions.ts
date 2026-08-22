"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDocumentAction } from "@/features/documents/actions";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

type UnitFieldErrors = {
  bathroomCount?: string[];
  bedroomCount?: string[];
  document?: string[];
  floor?: string[];
  operationalState?: string[];
  propertyId?: string[];
  sizeSqm?: string[];
  unitId?: string[];
  unitNumber?: string[];
};

export type UnitActionState = {
  fieldErrors?: UnitFieldErrors;
  message?: string;
  propertyId?: string;
  status?: "error" | "success";
  unitId?: string;
};

const unitOperationalStateSchema = z.enum(["active", "maintenance", "inactive"]);

const unitMutationSchema = z
  .object({
    bathroomCount: z.string().trim(),
    bedroomCount: z.string().trim(),
    floor: z
      .string()
      .trim()
      .max(40, "Keep the floor under 40 characters."),
    propertyId: postgresUuid("Choose a property."),
    sizeSqm: z.string().trim(),
    operationalState: unitOperationalStateSchema,
    unitNumber: z
      .string()
      .trim()
      .min(1, "Enter a unit number.")
      .max(40, "Keep the unit number under 40 characters."),
  })
  .superRefine((data, context) => {
    if (data.sizeSqm.length > 0) {
      const size = Number(data.sizeSqm);

      if (!Number.isFinite(size) || size < 0) {
        context.addIssue({
          code: "custom",
          message: "Enter a valid non-negative size.",
          path: ["sizeSqm"],
        });
      }
    }

    for (const field of ["bedroomCount", "bathroomCount"] as const) {
      const value = data[field];

      if (value.length === 0) {
        continue;
      }

      const count = Number(value);

      if (!Number.isInteger(count) || count < 0 || count > 100) {
        context.addIssue({
          code: "custom",
          message: "Enter a whole number from 0 to 100.",
          path: [field],
        });
      }
    }
  });

const unitIdSchema = postgresUuid("Choose a unit.");

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): UnitActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as UnitFieldErrors,
    status: "error",
  };
}

function nullableString(value: string) {
  return value.length > 0 ? value : null;
}

function nullableNumber(value: string) {
  return value.length > 0 ? Number(value) : null;
}

function validateInlineDocumentFile(formData: FormData) {
  const file = formData.get("document");

  if (!(file instanceof File) || file.size === 0) {
    return "";
  }

  if (file.size > 10 * 1024 * 1024) {
    return "Files must be 10 MB or smaller.";
  }

  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    )
  ) {
    return "Upload a PDF, JPG, PNG, or WebP file.";
  }

  return "";
}

export async function createUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requirePermission("properties.write");
  const parsed = unitMutationSchema.safeParse(readUnitMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const documentError = validateInlineDocumentFile(formData);

  if (documentError) {
    return {
      fieldErrors: { document: [documentError] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: unitId, error } = await supabase.rpc("create_unit", {
    p_bathroom_count: nullableNumber(parsed.data.bathroomCount),
    p_bedroom_count: nullableNumber(parsed.data.bedroomCount),
    p_floor: nullableString(parsed.data.floor),
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_size_sqm: nullableNumber(parsed.data.sizeSqm),
    p_status: toStoredUnitStatus(parsed.data.operationalState),
    p_unit_number: parsed.data.unitNumber,
  });

  if (error) {
    return {
      message: unitActionErrorMessage(error.message),
      status: "error",
    };
  }

  const documentState = await uploadInlineUnitDocument({
    formData,
    propertyId: parsed.data.propertyId,
    unitId,
  });

  if (documentState?.status === "error") {
    return {
      message: "Unit added, but the file was not uploaded.",
      propertyId: parsed.data.propertyId,
      status: "success",
      unitId,
    };
  }

  revalidateUnitPaths([parsed.data.propertyId], unitId);

  return {
    message: documentState ? "Unit added and file uploaded." : "Unit added.",
    propertyId: parsed.data.propertyId,
    status: "success",
    unitId,
  };
}

export async function updateUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requirePermission("properties.write");
  const parsedUnitId = unitIdSchema.safeParse(readString(formData, "unitId"));
  const parsed = unitMutationSchema.safeParse(readUnitMutationInput(formData));

  if (!parsedUnitId.success) {
    return {
      fieldErrors: { unitId: ["Choose a unit."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const documentError = validateInlineDocumentFile(formData);

  if (documentError) {
    return {
      fieldErrors: { document: [documentError] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getUnitPathContext(
    supabase,
    context.organizationId,
    parsedUnitId.data,
  );

  if (pathContext && parsed.data.propertyId !== pathContext.property_id) {
    return {
      fieldErrors: {
        propertyId: ["A unit must stay under its original property."],
      },
      status: "error",
    };
  }

  const { error } = await supabase.rpc("update_unit", {
    p_bathroom_count: nullableNumber(parsed.data.bathroomCount),
    p_bedroom_count: nullableNumber(parsed.data.bedroomCount),
    p_floor: nullableString(parsed.data.floor),
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_size_sqm: nullableNumber(parsed.data.sizeSqm),
    p_status: toStoredUnitStatus(parsed.data.operationalState),
    p_unit_id: parsedUnitId.data,
    p_unit_number: parsed.data.unitNumber,
  });

  if (error) {
    return {
      message: unitActionErrorMessage(error.message),
      status: "error",
    };
  }

  const documentState = await uploadInlineUnitDocument({
    formData,
    propertyId: parsed.data.propertyId,
    unitId: parsedUnitId.data,
  });

  if (documentState?.status === "error") {
    return documentState;
  }

  revalidateUnitPaths(
    [pathContext?.property_id, parsed.data.propertyId],
    parsedUnitId.data,
  );

  return {
    message: documentState ? "Unit updated and file uploaded." : "Unit updated.",
    propertyId: parsed.data.propertyId,
    status: "success",
    unitId: parsedUnitId.data,
  };
}

export async function archiveUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requirePermission("properties.archive");
  const parsedUnitId = unitIdSchema.safeParse(readString(formData, "unitId"));

  if (!parsedUnitId.success) {
    return {
      fieldErrors: { unitId: ["Choose a unit."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getUnitPathContext(
    supabase,
    context.organizationId,
    parsedUnitId.data,
  );
  const { error } = await supabase.rpc("archive_unit", {
    p_organization_id: context.organizationId,
    p_unit_id: parsedUnitId.data,
  });

  if (error) {
    return {
      message: unitActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateUnitPaths([pathContext?.property_id], parsedUnitId.data);

  return {
    message: "Unit archived.",
    status: "success",
  };
}

export async function restoreUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requirePermission("properties.archive");
  const parsedUnitId = unitIdSchema.safeParse(readString(formData, "unitId"));

  if (!parsedUnitId.success) {
    return {
      fieldErrors: { unitId: ["Choose a unit."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getUnitPathContext(
    supabase,
    context.organizationId,
    parsedUnitId.data,
  );
  const { error } = await supabase.rpc("restore_unit", {
    p_organization_id: context.organizationId,
    p_unit_id: parsedUnitId.data,
  });

  if (error) {
    return {
      message: unitActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateUnitPaths([pathContext?.property_id], parsedUnitId.data);

  return {
    message: "Unit restored.",
    status: "success",
  };
}

function readUnitMutationInput(formData: FormData) {
  return {
    bathroomCount: readString(formData, "bathroomCount"),
    bedroomCount: readString(formData, "bedroomCount"),
    floor: readString(formData, "floor"),
    propertyId: readString(formData, "propertyId"),
    sizeSqm: readString(formData, "sizeSqm"),
    operationalState: readString(formData, "operationalState"),
    unitNumber: readString(formData, "unitNumber"),
  };
}

function toStoredUnitStatus(operationalState: "active" | "maintenance" | "inactive") {
  return operationalState === "active" ? "vacant" : operationalState;
}

async function uploadInlineUnitDocument({
  formData,
  propertyId,
  unitId,
}: {
  formData: FormData;
  propertyId: string;
  unitId: string;
}): Promise<UnitActionState | null> {
  const file = formData.get("document");

  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const documentFormData = new FormData();
  documentFormData.set("category", readString(formData, "documentCategory"));
  documentFormData.set("document", file);
  documentFormData.set("leaseId", "");
  documentFormData.set("propertyId", propertyId);
  documentFormData.set("taskId", "");
  documentFormData.set("unitId", unitId);

  const state = await createDocumentAction({}, documentFormData);

  if (state.status === "error") {
    return {
      fieldErrors: {
        document: state.fieldErrors?.document,
      },
      message: state.message ?? "Unit saved, but the file was not uploaded.",
      propertyId,
      status: "error",
      unitId,
    };
  }

  return {
    propertyId,
    status: "success",
    unitId,
  };
}

async function getUnitPathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  unitId: string,
) {
  const { data } = await supabase
    .from("units")
    .select("property_id")
    .eq("id", unitId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
}

function revalidateUnitPaths(
  propertyIds: Array<string | null | undefined>,
  unitId?: string | null,
) {
  revalidatePath("/overview");
  revalidatePath("/ledger");
  revalidatePath("/leases");
  revalidatePath("/documents");
  revalidatePath("/reports");
  revalidatePath("/timeline");
  revalidatePath("/units");
  revalidatePath("/properties");

  for (const propertyId of new Set(propertyIds.filter(Boolean))) {
    revalidatePath(`/properties/${propertyId}`);
  }

  if (unitId) {
    revalidatePath(`/units/${unitId}`);
  }
}

function unitActionErrorMessage(message: string) {
  if (message.includes("duplicate key")) {
    return "A unit with this number already exists for that property.";
  }

  if (message.includes("Unit has an open Lease")) {
    return "End or cancel the open lease before archiving this unit.";
  }

  if (message.includes("Property not found")) {
    return "Choose an active property before saving this unit.";
  }

  if (message.includes("Unit not found")) {
    return "We could not find that unit.";
  }

  if (message.includes("Unit property cannot be changed")) {
    return "A unit must stay under its original property.";
  }

  return "We could not save the unit. Please check the fields and try again.";
}
