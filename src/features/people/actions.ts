"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type PeopleFieldErrors = {
  displayName?: string[];
  legalName?: string[];
  notes?: string[];
  partyType?: string[];
  personId?: string[];
  primaryEmail?: string[];
  primaryPhone?: string[];
  roles?: string[];
  taxIdentifier?: string[];
};

export type PeopleActionState = {
  fieldErrors?: PeopleFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const personIdSchema = z.uuid("Choose a person.");
const partyTypeSchema = z.enum(["individual", "company"]);
const roleSchema = z.enum(["tenant", "owner", "vendor", "staff"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const peopleMutationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(140, "Keep the display name under 140 characters."),
  legalName: z
    .string()
    .trim()
    .max(180, "Keep the legal name under 180 characters."),
  notes: z.string().trim().max(900, "Keep notes under 900 characters."),
  partyType: partyTypeSchema,
  primaryEmail: z
    .string()
    .trim()
    .max(180, "Keep the email under 180 characters.")
    .refine((value) => value === "" || emailPattern.test(value), {
      message: "Enter a valid email.",
    }),
  primaryPhone: z
    .string()
    .trim()
    .max(60, "Keep the phone under 60 characters."),
  roles: z.array(roleSchema).min(1, "Choose at least one role."),
  taxIdentifier: z
    .string()
    .trim()
    .max(80, "Keep the tax identifier under 80 characters."),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readPeopleMutationInput(formData: FormData) {
  return {
    displayName: readString(formData, "displayName"),
    legalName: readString(formData, "legalName"),
    notes: readString(formData, "notes"),
    partyType: readString(formData, "partyType"),
    primaryEmail: readString(formData, "primaryEmail"),
    primaryPhone: readString(formData, "primaryPhone"),
    roles: formData
      .getAll("roles")
      .map((value) => (typeof value === "string" ? value : "")),
    taxIdentifier: readString(formData, "taxIdentifier"),
  };
}

function invalidFormState(error: z.ZodError): PeopleActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as PeopleFieldErrors,
    status: "error",
  };
}

function nullableString(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function peopleRpcPayload(
  context: Awaited<ReturnType<typeof requireAdminContext>>,
  values: z.infer<typeof peopleMutationSchema>,
) {
  return {
    p_display_name: values.displayName,
    p_legal_name: nullableString(values.legalName),
    p_notes: nullableString(values.notes),
    p_organization_id: context.organizationId,
    p_party_type: values.partyType,
    p_primary_email: nullableString(values.primaryEmail),
    p_primary_phone: nullableString(values.primaryPhone),
    p_roles: values.roles,
    p_tax_identifier: nullableString(values.taxIdentifier),
  };
}

export async function createPersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const context = await requireAdminContext();
  const parsed = peopleMutationSchema.safeParse(readPeopleMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_person", {
    ...peopleRpcPayload(context, parsed.data),
  });

  if (error) {
    return {
      message: peopleActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    message: "Person added.",
    status: "success",
  };
}

export async function updatePersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const context = await requireAdminContext();
  const parsedPersonId = personIdSchema.safeParse(readString(formData, "personId"));
  const parsed = peopleMutationSchema.safeParse(readPeopleMutationInput(formData));

  if (!parsedPersonId.success) {
    return {
      fieldErrors: { personId: ["Choose a person."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_person", {
    ...peopleRpcPayload(context, parsed.data),
    p_person_id: parsedPersonId.data,
  });

  if (error) {
    return {
      message: peopleActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    message: "Person updated.",
    status: "success",
  };
}

export async function archivePersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  return updatePersonArchiveState({
    archived: true,
    fallbackMessage: "Person archived.",
    formData,
  });
}

export async function restorePersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  return updatePersonArchiveState({
    archived: false,
    fallbackMessage: "Person restored.",
    formData,
  });
}

async function updatePersonArchiveState({
  archived,
  fallbackMessage,
  formData,
}: {
  archived: boolean;
  fallbackMessage: string;
  formData: FormData;
}): Promise<PeopleActionState> {
  const context = await requireAdminContext();
  const parsedPersonId = personIdSchema.safeParse(readString(formData, "personId"));

  if (!parsedPersonId.success) {
    return {
      fieldErrors: { personId: ["Choose a person."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const payload = {
    p_organization_id: context.organizationId,
    p_person_id: parsedPersonId.data,
  };
  const { error } = archived
    ? await supabase.rpc("archive_person", payload)
    : await supabase.rpc("restore_person", payload);

  if (error) {
    return {
      message: peopleActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    message: fallbackMessage,
    status: "success",
  };
}

function revalidatePeoplePaths() {
  revalidatePath("/overview");
  revalidatePath("/documents");
  revalidatePath("/ledger");
  revalidatePath("/people");
  revalidatePath("/tenants");
  revalidatePath("/owners");
  revalidatePath("/vendors");
  revalidatePath("/team");
  revalidatePath("/leases");
  revalidatePath("/properties");
  revalidatePath("/timeline");
  revalidatePath("/units");
  revalidatePath("/reports");
}

function peopleActionErrorMessage(message: string) {
  if (message.includes("duplicate key")) {
    return "That person or role already exists.";
  }

  if (message.includes("Not authorized") || message.includes("row-level security")) {
    return "You do not have access to save this person.";
  }

  if (message.includes("Person not found")) {
    return "We could not find that person.";
  }

  return "We could not save the person. Please check the fields and try again.";
}
