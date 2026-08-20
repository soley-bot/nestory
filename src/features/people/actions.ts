"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getPeopleMutationErrorMessage } from "@/features/people/people-action-errors";
import type { PersonRoleValue } from "@/features/people/people.types";

type PeopleFieldErrors = {
  displayName?: string[];
  effectiveDate?: string[];
  legalName?: string[];
  notes?: string[];
  note?: string[];
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
const tenantArchiveSchema = z.object({
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date."),
  leaseIds: z.array(z.uuid("Choose a linked lease.")),
  note: z.string().trim().max(300, "Keep the note under 300 characters."),
  personId: personIdSchema,
});

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
  context: Awaited<ReturnType<typeof requireSuperAdminContext>>,
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
  const context = await requireSuperAdminContext();
  const parsed = peopleMutationSchema.safeParse(
    readPeopleMutationInput(formData),
  );

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: personId, error } = await supabase.rpc("create_person", {
    ...peopleRpcPayload(context, parsed.data),
  });

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
  const context = await requireSuperAdminContext();
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
  const context = await requireSuperAdminContext();
  const parsed = tenantArchiveSchema.safeParse({
    effectiveDate: readString(formData, "effectiveDate"),
    leaseIds: formData
      .getAll("leaseId")
      .map((value) => (typeof value === "string" ? value : "")),
    note: readString(formData, "note"),
    personId: readString(formData, "personId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: partyRows, error: partyError } = await supabase
    .from("lease_parties")
    .select("lease_id, party_role, is_primary")
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

  const currentLeaseIds = [
    ...new Set((partyRows ?? []).map((party) => party.lease_id)),
  ];
  const expectedLeaseIds = [...new Set(parsed.data.leaseIds)];

  if (
    currentLeaseIds.length !== expectedLeaseIds.length ||
    currentLeaseIds.some((leaseId) => !expectedLeaseIds.includes(leaseId))
  ) {
    return {
      message: "The tenant's linked leases changed. Refresh and try again.",
      status: "error",
    };
  }

  const primaryLeaseIds = [
    ...new Set(
      (partyRows ?? [])
        .filter(
          (party) =>
            party.is_primary && party.party_role === "primary_tenant",
        )
        .map((party) => party.lease_id),
    ),
  ];

  if (currentLeaseIds.length !== primaryLeaseIds.length) {
    return {
      message:
        "Change the primary tenant on the linked lease before archiving this person.",
      status: "error",
    };
  }

  if (primaryLeaseIds.length > 1) {
    return {
      message: "Review each open lease before archiving this tenant.",
      status: "error",
    };
  }

  const leaseIds = primaryLeaseIds;
  let tenancyTransitioned = false;

  if (leaseIds.length > 0) {
    const [{ data: leaseRows, error: leaseError }, { data: occupancyRows, error: occupancyError }] =
      await Promise.all([
        supabase
          .from("leases")
          .select("id, status")
          .eq("organization_id", context.organizationId)
          .in("id", leaseIds)
          .is("archived_at", null),
        supabase
          .from("lease_occupancies")
          .select("id, lease_id, evidence_state, updated_at")
          .eq("organization_id", context.organizationId)
          .in("lease_id", leaseIds)
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
      ]);

    if (leaseError || occupancyError) {
      return {
        message: "The tenant's open leases could not be prepared for archiving.",
        status: "error",
      };
    }

    for (const leaseId of leaseIds) {
      const lease = (leaseRows ?? []).find((row) => row.id === leaseId);
      const leaseOccupancies = (occupancyRows ?? []).filter(
        (row) => row.lease_id === leaseId,
      );
      const occupancy =
        leaseOccupancies.find((row) => row.evidence_state === "accepted") ??
        leaseOccupancies[0];

      if (!lease || !occupancy) {
        return {
          message: "Open the linked lease and review its occupancy before archiving.",
          status: "error",
        };
      }

      const status = lease.status.toLowerCase();
      const transition = status === "draft" ? "cancel" : "terminate";

      if (!["active", "draft", "notice_given"].includes(status)) {
        return {
          message: "Open the linked lease and review its status before archiving.",
          status: "error",
        };
      }

      const reason = [
        "Tenant archived from person record.",
        parsed.data.note,
      ]
        .filter(Boolean)
        .join(" ");
      const { data: transitionResult, error: transitionError } =
        await supabase.rpc("transition_lease_lifecycle", {
          p_effective_date: parsed.data.effectiveDate,
          p_expected_occupancy_id: occupancy.id,
          p_expected_status: status,
          p_idempotency_key: `archive-tenant:${parsed.data.personId}:${leaseId}:${parsed.data.effectiveDate}`,
          p_lease_id: leaseId,
          p_organization_id: context.organizationId,
          p_reason: reason,
          p_scheduled_move_out_date: null as never,
          p_transition: transition,
        });

      if (transitionError || !transitionResult) {
        return {
          message: "The linked lease could not be ended. The tenant was not archived.",
          status: "error",
        };
      }

      tenancyTransitioned = true;
    }
  }

  const { error: archiveError } = await supabase.rpc("archive_person", {
    p_organization_id: context.organizationId,
    p_person_id: parsed.data.personId,
  });

  if (archiveError) {
    if (tenancyTransitioned) {
      revalidatePeoplePaths();
      return {
        message:
          "The tenancy ended, but the tenant was not archived. Refresh and choose Archive again.",
        status: "error",
      };
    }

    return {
      message: getPeopleMutationErrorMessage(archiveError, "archive"),
      status: "error",
    };
  }

  revalidatePeoplePaths();

  return {
    message:
      leaseIds.length > 0
        ? "Tenancy ended and tenant archived."
        : "Tenant archived.",
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
  const context = await requireSuperAdminContext();
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
