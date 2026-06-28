"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type UnitFieldErrors = {
  currentRentAmount?: string[];
  floor?: string[];
  propertyId?: string[];
  sizeSqm?: string[];
  status?: string[];
  unitId?: string[];
  unitNumber?: string[];
};

export type UnitActionState = {
  fieldErrors?: UnitFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const unitStatusSchema = z.enum([
  "vacant",
  "occupied",
  "reserved",
  "maintenance",
  "inactive",
]);

const unitMutationSchema = z
  .object({
    currentRentAmount: z.string().trim(),
    floor: z
      .string()
      .trim()
      .max(40, "Keep the floor under 40 characters."),
    propertyId: z.uuid("Choose a property."),
    sizeSqm: z.string().trim(),
    status: unitStatusSchema,
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

    if (data.currentRentAmount.length === 0) {
      return;
    }

    const amount = Number(data.currentRentAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid non-negative rent amount.",
        path: ["currentRentAmount"],
      });
    }
  });

const unitIdSchema = z.uuid("Choose a unit.");

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

export async function createUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requireAdminContext();
  const parsed = unitMutationSchema.safeParse(readUnitMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: unitId, error } = await supabase.rpc("create_unit", {
    p_current_rent_amount: nullableNumber(parsed.data.currentRentAmount),
    p_current_rent_currency:
      parsed.data.currentRentAmount.length > 0 ? "USD" : null,
    p_floor: nullableString(parsed.data.floor),
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_size_sqm: nullableNumber(parsed.data.sizeSqm),
    p_status: parsed.data.status,
    p_unit_number: parsed.data.unitNumber,
  });

  if (error) {
    return {
      message: unitActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateUnitPaths([parsed.data.propertyId], unitId);

  return {
    message: "Unit added.",
    status: "success",
  };
}

export async function updateUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requireAdminContext();
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
    p_current_rent_amount: nullableNumber(parsed.data.currentRentAmount),
    p_current_rent_currency:
      parsed.data.currentRentAmount.length > 0 ? "USD" : null,
    p_floor: nullableString(parsed.data.floor),
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_size_sqm: nullableNumber(parsed.data.sizeSqm),
    p_status: parsed.data.status,
    p_unit_id: parsedUnitId.data,
    p_unit_number: parsed.data.unitNumber,
  });

  if (error) {
    return {
      message: unitActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateUnitPaths(
    [pathContext?.property_id, parsed.data.propertyId],
    parsedUnitId.data,
  );

  return {
    message: "Unit updated.",
    status: "success",
  };
}

export async function archiveUnitAction(
  _state: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  const context = await requireAdminContext();
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
  const context = await requireAdminContext();
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
    currentRentAmount: readString(formData, "currentRentAmount"),
    floor: readString(formData, "floor"),
    propertyId: readString(formData, "propertyId"),
    sizeSqm: readString(formData, "sizeSqm"),
    status: readString(formData, "status"),
    unitNumber: readString(formData, "unitNumber"),
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
