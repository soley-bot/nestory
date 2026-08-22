"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getPeopleMutationErrorMessage } from "@/features/people/people-action-errors";
import type { PersonRoleValue } from "@/features/people/people.types";

type PeopleFieldErrors = {
  displayName?: string[];
  legalName?: string[];
  notes?: string[];
  partyType?: string[];
  passportExpiryDate?: string[];
  passportNumber?: string[];
  personId?: string[];
  primaryEmail?: string[];
  primaryPhone?: string[];
  roles?: string[];
  taxIdentifier?: string[];
  visaExpiryDate?: string[];
};

export type PeopleActionState = {
  displayName?: string;
  fieldErrors?: PeopleFieldErrors;
  message?: string;
  personId?: string;
  roles?: PersonRoleValue[];
  status?: "error" | "success";
};

const personIdSchema = z.uuid("Choose a person.");
const partyTypeSchema = z.enum(["individual", "company"]);
const roleSchema = z.enum(["tenant", "owner", "vendor", "staff"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const optionalDateSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Enter a valid date.",
  );
const tenantArchiveSchema = z.object({ personId: personIdSchema });

const peopleMutationSchema = z
  .object({
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
    passportExpiryDate: optionalDateSchema,
    passportNumber: z
      .string()
      .trim()
      .max(80, "Keep the passport number under 80 characters."),
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
    visaExpiryDate: optionalDateSchema,
  })
  .superRefine((values, context) => {
    if (Boolean(values.passportNumber) === Boolean(values.passportExpiryDate)) {
      return;
    }

    context.addIssue({
      code: "custom",
      message: "Enter both the passport number and expiry date.",
      path: [values.passportNumber ? "passportExpiryDate" : "passportNumber"],
    });
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
    passportExpiryDate: readString(formData, "passportExpiryDate"),
    passportNumber: readString(formData, "passportNumber"),
    primaryEmail: readString(formData, "primaryEmail"),
    primaryPhone: readString(formData, "primaryPhone"),
    roles: formData
      .getAll("roles")
      .map((value) => (typeof value === "string" ? value : "")),
    taxIdentifier: readString(formData, "taxIdentifier"),
    visaExpiryDate: readString(formData, "visaExpiryDate"),
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
  context: Awaited<ReturnType<typeof requirePermission>>,
  values: z.infer<typeof peopleMutationSchema>,
) {
  return {
    p_display_name: values.displayName,
    p_legal_name: nullableString(values.legalName),
    p_notes: nullableString(values.notes),
    p_organization_id: context.organizationId,
    p_party_type: values.partyType,
    p_passport_expiry_date: nullableString(values.passportExpiryDate),
    p_passport_number: nullableString(values.passportNumber),
    p_primary_email: nullableString(values.primaryEmail),
    p_primary_phone: nullableString(values.primaryPhone),
    p_roles: values.roles,
    p_tax_identifier: nullableString(values.taxIdentifier),
    p_visa_expiry_date: nullableString(values.visaExpiryDate),
  };
}

export async function createPersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const context = await requirePermission("people.write");
  const creationScope = readString(formData, "creationScope");

  if (!context.isSuperAdmin && creationScope !== "branch") {
    return {
      message: "Add this person from the branch work that needs the relationship.",
      status: "error",
    };
  }
  const parsed = peopleMutationSchema.safeParse(
    readPeopleMutationInput(formData),
  );

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const payload = {
    ...peopleRpcPayload(context, parsed.data),
    ...(!context.isSuperAdmin && context.branchId
      ? { p_branch_id: context.branchId }
      : {}),
  };
  const { data: personId, error } = await supabase.rpc("create_person", payload);

  if (error) {
    return {
      message: getPeopleMutationErrorMessage(error, "create"),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    displayName: parsed.data.displayName,
    message: "Person added.",
    personId,
    roles: parsed.data.roles,
    status: "success",
  };
}

export async function updatePersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const context = await requirePermission("people.write");
  const parsedPersonId = personIdSchema.safeParse(
    readString(formData, "personId"),
  );
  const parsed = peopleMutationSchema.safeParse(
    readPeopleMutationInput(formData),
  );

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
      message: getPeopleMutationErrorMessage(error, "update"),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    displayName: parsed.data.displayName,
    message: "Person updated.",
    personId: parsedPersonId.data,
    roles: parsed.data.roles,
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

export async function archiveTenantAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const context = await requirePermission("people.archive");
  const parsed = tenantArchiveSchema.safeParse({
    personId: readString(formData, "personId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: partyRows, error: partyError } = await supabase
    .from("lease_parties")
    .select("lease_id")
    .eq("organization_id", context.organizationId)
    .eq("person_id", parsed.data.personId)
    .eq("evidence_state", "accepted")
    .in("business_lifecycle", ["planned", "effective"])
    .is("ended_on", null)
    .is("archived_at", null);

  if (partyError) {
    return {
      message: "The tenant's open leases could not be checked.",
      status: "error",
    };
  }

  if ((partyRows ?? []).length > 0) {
    return {
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    };
  }

  const { error: archiveError } = await supabase.rpc("archive_person", {
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
  });

  if (archiveError) {
    return {
      message: getPeopleMutationErrorMessage(archiveError, "archive"),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    message: "Tenant archived.",
    status: "success",
  };
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
  const context = await requirePermission("people.archive");
  const parsedPersonId = personIdSchema.safeParse(
    readString(formData, "personId"),
  );

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
      message: getPeopleMutationErrorMessage(
        error,
        archived ? "archive" : "restore",
      ),
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
  revalidatePath("/leases");
  revalidatePath("/properties");
  revalidatePath("/timeline");
  revalidatePath("/units");
  revalidatePath("/reports");
}
