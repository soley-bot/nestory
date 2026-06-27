"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { PersonRoleValue } from "@/features/people/people.types";
import {
  asUntypedSupabase,
  isMissingPeopleSchemaMessage,
  type UntypedSupabaseClient,
} from "@/features/people/data/untyped-supabase";

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

type RoleActionRow = {
  archivedAt: string | null;
  id: string;
  role: PersonRoleValue;
};

const personIdSchema = z.uuid("Choose a person.");
const partyTypeSchema = z.enum(["individual", "company"]);
const roleSchema = z.enum(["tenant", "owner", "vendor"]);
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

export async function createPersonAction(
  _state: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  const context = await requireAdminContext();
  const parsed = peopleMutationSchema.safeParse(readPeopleMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = asUntypedSupabase(await createSupabaseServerClient());
  const now = new Date().toISOString();
  const personResult = await supabase
    .from("people")
    .insert({
      created_by: context.userId,
      display_name: parsed.data.displayName,
      legal_name: nullableString(parsed.data.legalName),
      notes: nullableString(parsed.data.notes),
      organization_id: context.organizationId,
      party_type: parsed.data.partyType,
      primary_email: nullableString(parsed.data.primaryEmail),
      primary_phone: nullableString(parsed.data.primaryPhone),
      tax_identifier: nullableString(parsed.data.taxIdentifier),
      updated_at: now,
      updated_by: context.userId,
    })
    .select("id")
    .single();

  if (personResult.error) {
    return {
      message: peopleActionErrorMessage(personResult.error.message),
      status: "error",
    };
  }

  const personId = readResultId(personResult.data);

  if (!personId) {
    return {
      message: "The person was saved, but the new record id was not returned.",
      status: "error",
    };
  }

  const roleState = await syncPersonRoles({
    organizationId: context.organizationId,
    personId,
    roles: parsed.data.roles,
    supabase,
    userId: context.userId,
  });

  if (roleState.status === "error") {
    return roleState;
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

  const supabase = asUntypedSupabase(await createSupabaseServerClient());
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("people")
    .update({
      display_name: parsed.data.displayName,
      legal_name: nullableString(parsed.data.legalName),
      notes: nullableString(parsed.data.notes),
      party_type: parsed.data.partyType,
      primary_email: nullableString(parsed.data.primaryEmail),
      primary_phone: nullableString(parsed.data.primaryPhone),
      tax_identifier: nullableString(parsed.data.taxIdentifier),
      updated_at: now,
      updated_by: context.userId,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", parsedPersonId.data);

  if (updateResult.error) {
    return {
      message: peopleActionErrorMessage(updateResult.error.message),
      status: "error",
    };
  }

  const roleState = await syncPersonRoles({
    organizationId: context.organizationId,
    personId: parsedPersonId.data,
    roles: parsed.data.roles,
    supabase,
    userId: context.userId,
  });

  if (roleState.status === "error") {
    return roleState;
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

  const supabase = asUntypedSupabase(await createSupabaseServerClient());
  const now = new Date().toISOString();
  const result = await supabase
    .from("people")
    .update({
      archived_at: archived ? now : null,
      archived_by: archived ? context.userId : null,
      updated_at: now,
      updated_by: context.userId,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", parsedPersonId.data);

  if (result.error) {
    return {
      message: peopleActionErrorMessage(result.error.message),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    message: fallbackMessage,
    status: "success",
  };
}

async function syncPersonRoles({
  organizationId,
  personId,
  roles,
  supabase,
  userId,
}: {
  organizationId: string;
  personId: string;
  roles: PersonRoleValue[];
  supabase: UntypedSupabaseClient;
  userId: string;
}): Promise<PeopleActionState> {
  const now = new Date().toISOString();
  const currentRolesResult = await supabase
    .from("person_roles")
    .select("id, role, archived_at")
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  if (currentRolesResult.error) {
    return {
      message: peopleActionErrorMessage(currentRolesResult.error.message),
      status: "error",
    };
  }

  const desiredRoles = new Set(roles);
  const currentRoles = asRoleActionRows(currentRolesResult.data);
  const roleWrites = [
    ...roles.map((role) => {
      const existing = currentRoles.find((row) => row.role === role);

      if (existing) {
        return supabase
          .from("person_roles")
          .update({
            archived_at: null,
            archived_by: null,
            status: "active",
            updated_at: now,
            updated_by: userId,
          })
          .eq("organization_id", organizationId)
          .eq("id", existing.id);
      }

      return supabase.from("person_roles").insert({
        archived_at: null,
        created_by: userId,
        organization_id: organizationId,
        person_id: personId,
        role,
        status: "active",
        updated_at: now,
        updated_by: userId,
      });
    }),
    ...currentRoles
      .filter((row) => !row.archivedAt && !desiredRoles.has(row.role))
      .map((row) =>
        supabase
          .from("person_roles")
          .update({
            archived_at: now,
            archived_by: userId,
            status: "inactive",
            updated_at: now,
            updated_by: userId,
          })
          .eq("organization_id", organizationId)
          .eq("id", row.id),
      ),
  ];

  const results = await Promise.all(roleWrites);
  const failed = results.find((result) => result.error);

  if (failed?.error) {
    return {
      message: peopleActionErrorMessage(failed.error.message),
      status: "error",
    };
  }

  return { status: "success" };
}

function asRoleActionRows(data: unknown): RoleActionRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const rows: RoleActionRow[] = [];

  for (const item of data) {
    if (!isRecord(item)) {
      continue;
    }

    const id = readRecordString(item, "id");
    const role = readRole(item, "role");

    if (!id || !role) {
      continue;
    }

    rows.push({
      archivedAt: readRecordNullableString(item, "archived_at"),
      id,
      role,
    });
  }

  return rows;
}

function readResultId(data: unknown) {
  return isRecord(data) ? readRecordString(data, "id") : "";
}

function readRole(row: Record<string, unknown>, key: string) {
  const value = readRecordString(row, key);

  if (value === "tenant" || value === "owner" || value === "vendor") {
    return value;
  }

  return null;
}

function readRecordNullableString(row: Record<string, unknown>, key: string) {
  const value = row[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRecordString(row: Record<string, unknown>, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revalidatePeoplePaths() {
  revalidatePath("/overview");
  revalidatePath("/people");
  revalidatePath("/tenants");
  revalidatePath("/leases");
  revalidatePath("/properties");
  revalidatePath("/units");
  revalidatePath("/reports");
}

function peopleActionErrorMessage(message: string) {
  if (isMissingPeopleSchemaMessage(message)) {
    return "People tables are not available yet. Run the People/Leases migration before saving records.";
  }

  if (message.includes("duplicate key")) {
    return "That person or role already exists.";
  }

  if (message.includes("violates row-level security")) {
    return "You do not have access to save this person.";
  }

  return "We could not save the person. Please check the fields and try again.";
}
