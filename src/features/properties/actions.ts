"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
  propertyId?: string[];
  propertyType?: string[];
  status?: string[];
};

export type PropertyActionState = {
  fieldErrors?: PropertyFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const propertyStatusSchema = z.enum([
  "active",
  "under_renovation",
  "inactive",
]);
const optionalUuidSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || z.uuid().safeParse(value).success, {
    message: "Choose a valid owner person.",
  });

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

const propertyIdSchema = z.uuid("Choose a property.");

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

  const supabase = await createSupabaseServerClient();
  const { data: propertyId, error } = await supabase.rpc("create_property", {
    p_acquisition_date: nullableString(parsed.data.acquisitionDate),
    p_address: nullableString(parsed.data.address),
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_notes: nullableString(parsed.data.notes),
    p_organization_id: context.organizationId,
    p_owner: nullableString(parsed.data.owner),
    p_property_type: parsed.data.propertyType,
    p_status: parsed.data.status,
  });

  if (error) {
    return {
      message: propertyActionErrorMessage(error.message),
      status: "error",
    };
  }

  const ownerSyncResult = await syncPrimaryOwnerLink({
    organizationId: context.organizationId,
    ownerPersonId: nullableString(parsed.data.ownerPersonId),
    propertyId,
    supabase,
    userId: context.userId,
  });

  if (ownerSyncResult.status === "error") {
    return ownerSyncResult;
  }

  revalidatePropertyPaths(propertyId);

  return {
    message: "Property added.",
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_property", {
    p_acquisition_date: nullableString(parsed.data.acquisitionDate),
    p_address: nullableString(parsed.data.address),
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_notes: nullableString(parsed.data.notes),
    p_organization_id: context.organizationId,
    p_owner: nullableString(parsed.data.owner),
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

  const ownerSyncResult = await syncPrimaryOwnerLink({
    organizationId: context.organizationId,
    ownerPersonId: nullableString(parsed.data.ownerPersonId),
    propertyId: parsedPropertyId.data,
    supabase,
    userId: context.userId,
  });

  if (ownerSyncResult.status === "error") {
    return ownerSyncResult;
  }

  revalidatePropertyPaths(parsedPropertyId.data);

  return {
    message: "Property updated.",
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

async function syncPrimaryOwnerLink({
  organizationId,
  ownerPersonId,
  propertyId,
  supabase,
  userId,
}: {
  organizationId: string;
  ownerPersonId: string | null;
  propertyId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}): Promise<PropertyActionState> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const currentOwnerResult = await supabase
    .from("property_owners")
    .select("id, person_id")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .eq("is_primary", true)
    .is("archived_at", null)
    .is("ended_on", null);

  if (currentOwnerResult.error) {
    return {
      message: propertyActionErrorMessage(currentOwnerResult.error.message),
      status: "error",
    };
  }

  if (ownerPersonId) {
    const ownerResult = await ensureOwnerPersonRole({
      organizationId,
      ownerPersonId,
      supabase,
      userId,
    });

    if (ownerResult.status === "error") {
      return ownerResult;
    }
  }

  const currentOwners = currentOwnerResult.data ?? [];
  const ownersToEnd = currentOwners.filter(
    (owner) => owner.person_id !== ownerPersonId,
  );
  const ownerWasChanged =
    ownersToEnd.length > 0 ||
    Boolean(
      ownerPersonId &&
        !currentOwners.some((owner) => owner.person_id === ownerPersonId),
    );

  if (ownersToEnd.length > 0) {
    const endResult = await supabase
      .from("property_owners")
      .update({
        ended_on: today,
        updated_at: now,
        updated_by: userId,
      })
      .eq("organization_id", organizationId)
      .in(
        "id",
        ownersToEnd.map((owner) => owner.id),
      );

    if (endResult.error) {
      return {
        message: propertyActionErrorMessage(endResult.error.message),
        status: "error",
      };
    }
  }

  const ownerAlreadyCurrent =
    ownerPersonId &&
    currentOwners.some((owner) => owner.person_id === ownerPersonId);

  if (ownerPersonId && !ownerAlreadyCurrent) {
    const insertResult = await supabase.from("property_owners").insert({
      created_by: userId,
      is_primary: true,
      organization_id: organizationId,
      ownership_label: "Primary",
      person_id: ownerPersonId,
      property_id: propertyId,
      started_on: today,
      updated_at: now,
      updated_by: userId,
    });

    if (insertResult.error) {
      return {
        message: propertyActionErrorMessage(insertResult.error.message),
        status: "error",
      };
    }
  }

  if (ownerWasChanged) {
    const activityResult = await supabase.from("activity_logs").insert({
      action: "property_owner_updated",
      actor_id: userId,
      entity_id: propertyId,
      entity_type: "property",
      new_values: {
        owner_person_id: ownerPersonId,
      },
      organization_id: organizationId,
      previous_values: {
        owner_person_ids: currentOwners.map((owner) => owner.person_id),
      },
    });

    if (activityResult.error) {
      return {
        message: propertyActionErrorMessage(activityResult.error.message),
        status: "error",
      };
    }
  }

  return { status: "success" };
}

async function ensureOwnerPersonRole({
  organizationId,
  ownerPersonId,
  supabase,
  userId,
}: {
  organizationId: string;
  ownerPersonId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}): Promise<PropertyActionState> {
  const now = new Date().toISOString();
  const personResult = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", ownerPersonId)
    .is("archived_at", null)
    .maybeSingle();

  if (personResult.error) {
    return {
      message: propertyActionErrorMessage(personResult.error.message),
      status: "error",
    };
  }

  if (!personResult.data) {
    return {
      fieldErrors: {
        ownerPersonId: ["Choose an active person for the current owner."],
      },
      status: "error",
    };
  }

  const roleResult = await supabase
    .from("person_roles")
    .select("id, archived_at")
    .eq("organization_id", organizationId)
    .eq("person_id", ownerPersonId)
    .eq("role", "owner");

  if (roleResult.error) {
    return {
      message: propertyActionErrorMessage(roleResult.error.message),
      status: "error",
    };
  }

  const existingRole =
    (roleResult.data ?? []).find((role) => role.archived_at === null) ??
    (roleResult.data ?? [])[0];

  if (existingRole) {
    const roleUpdateResult = await supabase
      .from("person_roles")
      .update({
        archived_at: null,
        archived_by: null,
        status: "active",
        updated_at: now,
        updated_by: userId,
      })
      .eq("organization_id", organizationId)
      .eq("id", existingRole.id);

    if (roleUpdateResult.error) {
      return {
        message: propertyActionErrorMessage(roleUpdateResult.error.message),
        status: "error",
      };
    }

    return { status: "success" };
  }

  const roleInsertResult = await supabase.from("person_roles").insert({
    created_by: userId,
    organization_id: organizationId,
    person_id: ownerPersonId,
    role: "owner",
    status: "active",
    updated_at: now,
    updated_by: userId,
  });

  if (roleInsertResult.error) {
    return {
      message: propertyActionErrorMessage(roleInsertResult.error.message),
      status: "error",
    };
  }

  return { status: "success" };
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

  return "We could not save the property. Please check the fields and try again.";
}
