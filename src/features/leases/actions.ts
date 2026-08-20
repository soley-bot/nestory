"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLeaseConfigurationContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import {
  getLeaseMutationErrorMessage,
  parseFutureRentTermInput,
  parseIdempotencyKey,
} from "@/features/leases/lease-action-input";
import { buildNewLeaseRelationshipPayload } from "@/features/leases/lease-relationship-input";

type LeaseFieldErrors = {
  activationDate?: string[];
  actualMoveInDate?: string[];
  actualMoveOutDate?: string[];
  amount?: string[];
  effectiveDate?: string[];
  eventDate?: string[];
  eventType?: string[];
  expectedOccupancyId?: string[];
  expectedStatus?: string[];
  leaseDepositId?: string[];
  depositAmount?: string[];
  leaseEndDate?: string[];
  leaseId?: string[];
  leaseStartDate?: string[];
  monthlyRentAmount?: string[];
  occupancyId?: string[];
  paymentFrequency?: string[];
  propertyId?: string[];
  rentDueDay?: string[];
  reason?: string[];
  scheduledMoveInDate?: string[];
  scheduledMoveOutDate?: string[];
  scheduleId?: string[];
  status?: string[];
  tenantPersonId?: string[];
  termStatus?: string[];
  transition?: string[];
  unitId?: string[];
};

export type LeaseActionState = {
  fieldErrors?: LeaseFieldErrors;
  leaseId?: string;
  message?: string;
  status?: "error" | "success";
  termId?: string;
};

const leaseStatusSchema = z.enum([
  "active",
  "cancelled",
  "draft",
  "ended",
  "notice_given",
  "terminated",
]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const optionalDateSchema = z.union([dateSchema, z.literal("")]);
const leaseIdSchema = postgresUuid("Choose a lease.");
const paymentFrequencySchema = z.enum([
  "annual",
  "monthly",
  "one_time",
  "quarterly",
  "semi_annual",
]);
const termStatusSchema = z.enum([
  "active",
  "draft",
  "expired",
  "terminated",
  "upcoming",
]);
const depositEventSchema = z.object({ amount: z.coerce.number().positive("Enter a positive amount."), eventDate: dateSchema, eventType: z.enum(["received", "retained", "refunded"]), leaseDepositId: postgresUuid("Choose a lease deposit."), reference: z.string().trim().max(200) });
const currentOccupancyEvidenceSchema = z
  .object({
    actualMoveInDate: dateSchema,
    leaseId: leaseIdSchema,
    occupancyId: postgresUuid("Choose the occupancy evidence to repair."),
    reason: z.string().trim().min(8, "Explain how occupancy was confirmed."),
    scheduledMoveInDate: optionalDateSchema,
    scheduledMoveOutDate: optionalDateSchema,
  })
  .superRefine((data, context) => {
    if (
      data.scheduledMoveInDate &&
      data.scheduledMoveOutDate &&
      data.scheduledMoveOutDate < data.scheduledMoveInDate
    ) {
      context.addIssue({
        code: "custom",
        message: "Scheduled move-out must be on or after scheduled move-in.",
        path: ["scheduledMoveOutDate"],
      });
    }
  });

const leaseLifecycleTransitionSchema = z
  .object({
    effectiveDate: dateSchema,
    expectedOccupancyId: postgresUuid("Choose the current occupancy record."),
    expectedStatus: leaseStatusSchema,
    idempotencyKey: z.string().trim().min(1),
    leaseId: leaseIdSchema,
    reason: z.string().trim().min(8, "Explain the lifecycle evidence."),
    scheduledMoveOutDate: optionalDateSchema,
    transition: z.enum([
      "activate",
      "cancel",
      "end",
      "give_notice",
      "terminate",
    ]),
  })
  .superRefine((data, context) => {
    if (
      data.transition === "give_notice" &&
      (!data.scheduledMoveOutDate ||
        data.scheduledMoveOutDate < data.effectiveDate)
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a move-out date on or after the notice date.",
        path: ["scheduledMoveOutDate"],
      });
    }
  });

const leaseActivationSchema = z.object({
  activationDate: dateSchema,
  expectedOccupancyId: postgresUuid("Choose the current occupancy record."),
  expectedStatus: z.literal("draft"),
  idempotencyKey: z.string().trim().min(1),
  leaseId: leaseIdSchema,
});
const cancelLeaseActivationSchema = z.object({
  leaseId: leaseIdSchema,
  scheduleId: postgresUuid("Choose the scheduled activation."),
});

const leaseMutationSchema = z
  .object({
    actualMoveInDate: optionalDateSchema,
    actualMoveOutDate: optionalDateSchema,
    depositAmount: z.string().trim(),
    leaseEndDate: dateSchema,
    leaseStartDate: dateSchema,
    monthlyRentAmount: z.string().trim(),
    paymentFrequency: paymentFrequencySchema,
    propertyId: postgresUuid("Choose a property."),
    rentDueDay: z.string().trim(),
    scheduledMoveInDate: optionalDateSchema,
    scheduledMoveOutDate: optionalDateSchema,
    status: leaseStatusSchema,
    tenantPersonId: postgresUuid("Choose a tenant."),
    termStatus: termStatusSchema,
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    if (
      data.unitId &&
      !postgresUuid("Choose a unit for this lease.").safeParse(data.unitId).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a unit for this lease.",
        path: ["unitId"],
      });
    }

    const rentAmount = Number(data.monthlyRentAmount);

    if (!Number.isFinite(rentAmount) || rentAmount <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a rent amount greater than zero.",
        path: ["monthlyRentAmount"],
      });
    }

    const rentDueDay = Number(data.rentDueDay);

    if (
      !Number.isInteger(rentDueDay) ||
      rentDueDay < 1 ||
      rentDueDay > 31
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter a due day from 1 to 31.",
        path: ["rentDueDay"],
      });
    }

    if (data.leaseEndDate <= data.leaseStartDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be after the start date.",
        path: ["leaseEndDate"],
      });
    }

    if (
      data.scheduledMoveInDate &&
      data.scheduledMoveOutDate &&
      data.scheduledMoveOutDate < data.scheduledMoveInDate
    ) {
      context.addIssue({
        code: "custom",
        message: "Scheduled move-out must be on or after scheduled move-in.",
        path: ["scheduledMoveOutDate"],
      });
    }

    if (data.actualMoveOutDate && !data.actualMoveInDate) {
      context.addIssue({
        code: "custom",
        message: "Enter the confirmed move-in before move-out.",
        path: ["actualMoveInDate"],
      });
    }

    if (
      data.actualMoveInDate &&
      data.actualMoveOutDate &&
      data.actualMoveOutDate < data.actualMoveInDate
    ) {
      context.addIssue({
        code: "custom",
        message: "Actual move-out must be on or after actual move-in.",
        path: ["actualMoveOutDate"],
      });
    }

    if (
      ["active", "notice_given"].includes(data.status) &&
      data.actualMoveOutDate
    ) {
      context.addIssue({
        code: "custom",
        message: "A current occupancy cannot already have an actual move-out.",
        path: ["actualMoveOutDate"],
      });
    }

    if (
      ["ended", "terminated"].includes(data.status) &&
      Boolean(data.actualMoveInDate) !== Boolean(data.actualMoveOutDate)
    ) {
      context.addIssue({
        code: "custom",
        message: "Ended occupancy needs both confirmed move-in and move-out dates.",
        path: [data.actualMoveInDate ? "actualMoveOutDate" : "actualMoveInDate"],
      });
    }

    if (
      ["cancelled", "draft"].includes(data.status) &&
      (data.actualMoveInDate || data.actualMoveOutDate)
    ) {
      context.addIssue({
        code: "custom",
        message: "Draft or cancelled leases cannot record actual occupancy.",
        path: [data.actualMoveInDate ? "actualMoveInDate" : "actualMoveOutDate"],
      });
    }

    if (data.depositAmount.length === 0) {
      return;
    }

    const depositAmount = Number(data.depositAmount);

    if (!Number.isFinite(depositAmount) || depositAmount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid non-negative deposit.",
        path: ["depositAmount"],
      });
    }
  });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): LeaseActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as LeaseFieldErrors,
    status: "error",
  };
}

function nullableNumber(value: string) {
  return value.length > 0 ? Number(value) : null;
}

function leaseAuthorityRpcPayload(
  organizationId: string,
  values: z.infer<typeof leaseMutationSchema>,
  idempotencyKey: string,
) {
  return {
    // Supabase's generated RPC signature cannot express nullable SQL
    // parameters, but the database contract intentionally accepts NULL here.
    p_deposit_amount: nullableNumber(values.depositAmount) as number,
    p_deposit_currency: (
      values.depositAmount.length > 0 ? "USD" : null
    ) as "USD",
    p_idempotency_key: idempotencyKey,
    p_lease_end_date: values.leaseEndDate,
    p_lease_start_date: values.leaseStartDate,
    p_lease_status: values.status,
    p_organization_id: organizationId,
    p_payment_frequency: values.paymentFrequency,
    p_primary_tenant_person_id: values.tenantPersonId,
    p_property_id: values.propertyId,
    p_rent_amount: Number(values.monthlyRentAmount),
    p_rent_currency: "USD",
    p_rent_due_day: Number(values.rentDueDay),
    p_term_status: values.termStatus,
    p_unit_id: values.unitId,
  } as const;
}

export async function createLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = leaseMutationSchema.safeParse(readLeaseMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const idempotencyKey = readIdempotencyKey(formData);

  if (!idempotencyKey) {
    return { message: "Refresh the form and try again.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const authorityPayload = leaseAuthorityRpcPayload(
    context.organizationId,
    parsed.data,
    idempotencyKey,
  );
  const { data: relationshipResult, error } = parsed.data.unitId
    ? await supabase.rpc("create_simplified_unit_lease", {
        ...authorityPayload,
        p_relationship_payload: buildNewLeaseRelationshipPayload({
          actualMoveInDate: parsed.data.actualMoveInDate || undefined,
          actualMoveOutDate: parsed.data.actualMoveOutDate || undefined,
          leaseStatus: parsed.data.status,
          recordSource: "operator_confirmed",
          scheduledMoveInDate: parsed.data.scheduledMoveInDate || undefined,
          scheduledMoveOutDate: parsed.data.scheduledMoveOutDate || undefined,
          tenantPersonId: parsed.data.tenantPersonId,
        }),
      })
    : await supabase.rpc("create_property_lease", {
        p_deposit_amount: authorityPayload.p_deposit_amount,
        p_deposit_currency: authorityPayload.p_deposit_currency,
        p_idempotency_key: authorityPayload.p_idempotency_key,
        p_lease_end_date: authorityPayload.p_lease_end_date,
        p_lease_start_date: authorityPayload.p_lease_start_date,
        p_lease_status: authorityPayload.p_lease_status,
        p_organization_id: authorityPayload.p_organization_id,
        p_payment_frequency: authorityPayload.p_payment_frequency,
        p_primary_tenant_person_id:
          authorityPayload.p_primary_tenant_person_id,
        p_property_id: authorityPayload.p_property_id,
        p_rent_amount: authorityPayload.p_rent_amount,
        p_rent_currency: authorityPayload.p_rent_currency,
        p_rent_due_day: authorityPayload.p_rent_due_day,
        p_term_status: authorityPayload.p_term_status,
      });

  if (error) {
    if (isLeaseUnitTermConflict(error.message)) {
      return {
        fieldErrors: {
          unitId: ["This unit is already reserved for those dates."],
        },
        message: "Choose another unit or change the lease dates.",
        status: "error",
      };
    }

    return {
      message: leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  const leaseId =
    relationshipResult &&
    typeof relationshipResult === "object" &&
    !Array.isArray(relationshipResult) &&
    typeof relationshipResult.leaseId === "string"
      ? relationshipResult.leaseId
      : null;

  if (!leaseId) {
    return {
      message: "The lease could not be confirmed after saving.",
      status: "error",
    };
  }

  revalidateLeasePaths(
    [parsed.data.propertyId],
    parsed.data.unitId ? [parsed.data.unitId] : [],
    leaseId,
  );

  return {
    leaseId,
    message: parsed.data.status === "active" ? "Lease created and activated." : "Draft lease created.",
    status: "success",
  };
}

export async function recordCurrentLeaseOccupancyEvidenceAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = currentOccupancyEvidenceSchema.safeParse({
    actualMoveInDate: readString(formData, "actualMoveInDate"),
    leaseId: readString(formData, "leaseId"),
    occupancyId: readString(formData, "occupancyId"),
    reason: readString(formData, "reason"),
    scheduledMoveInDate: readString(formData, "scheduledMoveInDate"),
    scheduledMoveOutDate: readString(formData, "scheduledMoveOutDate"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  // Generated RPC types cannot express nullable PostgreSQL function arguments.
  // The database intentionally accepts null when a scheduled date is unknown.
  const scheduledMoveInDate =
    (parsed.data.scheduledMoveInDate || null) as string;
  const scheduledMoveOutDate =
    (parsed.data.scheduledMoveOutDate || null) as string;
  const { data: occupancyId, error } = await supabase.rpc(
    "record_current_lease_occupancy_evidence",
    {
      p_actual_move_in_date: parsed.data.actualMoveInDate,
      p_expected_occupancy_id: parsed.data.occupancyId,
      p_lease_id: parsed.data.leaseId,
      p_organization_id: context.organizationId,
      p_reason: parsed.data.reason,
      p_scheduled_move_in_date: scheduledMoveInDate,
      p_scheduled_move_out_date: scheduledMoveOutDate,
    },
  );

  if (error || typeof occupancyId !== "string") {
    return {
      message: error
        ? leaseActionErrorMessage(error.message)
        : "The move-in confirmation could not be returned.",
      status: "error",
    };
  }

  revalidateLeasePaths([], [], parsed.data.leaseId);
  return {
    leaseId: parsed.data.leaseId,
    message: "Move-in confirmed.",
    status: "success",
  };
}

export async function transitionLeaseLifecycleAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = leaseLifecycleTransitionSchema.safeParse({
    effectiveDate: readString(formData, "effectiveDate"),
    expectedOccupancyId: readString(formData, "expectedOccupancyId"),
    expectedStatus: readString(formData, "expectedStatus"),
    idempotencyKey: readString(formData, "idempotencyKey"),
    leaseId: readString(formData, "leaseId"),
    reason: readString(formData, "reason"),
    scheduledMoveOutDate: readString(formData, "scheduledMoveOutDate"),
    transition: readString(formData, "transition"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const scheduledMoveOutDate =
    (parsed.data.scheduledMoveOutDate || null) as string;
  const { data: result, error } = await supabase.rpc(
    "transition_lease_lifecycle",
    {
      p_effective_date: parsed.data.effectiveDate,
      p_expected_occupancy_id: parsed.data.expectedOccupancyId,
      p_expected_status: parsed.data.expectedStatus,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_lease_id: parsed.data.leaseId,
      p_organization_id: context.organizationId,
      p_reason: parsed.data.reason,
      p_scheduled_move_out_date: scheduledMoveOutDate,
      p_transition: parsed.data.transition,
    },
  );

  const returnedLeaseId =
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    typeof result.leaseId === "string"
      ? result.leaseId
      : null;

  if (error || !returnedLeaseId) {
    return {
      message: error
        ? leaseActionErrorMessage(error.message)
        : "The lease lifecycle transition was not returned.",
      status: "error",
    };
  }

  revalidateLeasePaths([], [], returnedLeaseId);

  return {
    leaseId: returnedLeaseId,
    message: getLeaseLifecycleSuccessMessage(parsed.data.transition),
    status: "success",
  };
}

export async function scheduleLeaseActivationAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = leaseActivationSchema.safeParse({
    activationDate: readString(formData, "activationDate"),
    expectedOccupancyId: readString(formData, "expectedOccupancyId"),
    expectedStatus: readString(formData, "expectedStatus"),
    idempotencyKey: readString(formData, "idempotencyKey"),
    leaseId: readString(formData, "leaseId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: result, error } = await supabase.rpc(
    "request_lease_activation",
    {
      p_activation_date: parsed.data.activationDate,
      p_expected_occupancy_id: parsed.data.expectedOccupancyId,
      p_expected_status: parsed.data.expectedStatus,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_lease_id: parsed.data.leaseId,
      p_organization_id: context.organizationId,
    },
  );

  const returnedLeaseId =
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    typeof result.leaseId === "string"
      ? result.leaseId
      : null;
  const activationStatus =
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    typeof result.status === "string"
      ? result.status
      : null;

  if (error || !returnedLeaseId) {
    return {
      message: error
        ? leaseActionErrorMessage(error.message)
        : "The Lease activation request was not returned.",
      status: "error",
    };
  }

  revalidateLeasePaths([], [], returnedLeaseId);
  return {
    leaseId: returnedLeaseId,
    message:
      activationStatus === "scheduled"
        ? `Lease activation scheduled for ${parsed.data.activationDate}.`
        : "Lease activated.",
    status: "success",
  };
}

export async function cancelLeaseActivationAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = cancelLeaseActivationSchema.safeParse({
    leaseId: readString(formData, "leaseId"),
    scheduleId: readString(formData, "scheduleId"),
  });
  if (!parsed.success) return invalidFormState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_lease_activation", {
    p_organization_id: context.organizationId,
    p_schedule_id: parsed.data.scheduleId,
  });
  if (error) {
    return { message: leaseActionErrorMessage(error.message), status: "error" };
  }
  revalidateLeasePaths([], [], parsed.data.leaseId);
  return {
    leaseId: parsed.data.leaseId,
    message: "Scheduled activation cancelled.",
    status: "success",
  };
}

export async function updateLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsedLeaseId = leaseIdSchema.safeParse(readString(formData, "leaseId"));
  const parsed = leaseMutationSchema.safeParse(readLeaseMutationInput(formData));

  if (!parsedLeaseId.success) {
    return {
      fieldErrors: { leaseId: ["Choose a lease."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const idempotencyKey = readIdempotencyKey(formData);

  if (!idempotencyKey) {
    return { message: "Refresh the form and try again.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getLeasePathContext(
    supabase,
    context.organizationId,
    parsedLeaseId.data,
  );

  if (!pathContext) {
    return {
      message: "We could not find that lease.",
      status: "error",
    };
  }

  const { error } = await supabase.rpc(
    "update_lease_with_authoritative_term",
    {
      ...leaseAuthorityRpcPayload(
        context.organizationId,
        parsed.data,
        idempotencyKey,
      ),
      p_lease_id: parsedLeaseId.data,
    },
  );

  if (error) {
    return {
      message:
        getLeaseMutationErrorMessage(error, "update") ??
        leaseActionErrorMessage(error.message, error.details),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [pathContext.property_id, parsed.data.propertyId],
    [pathContext.unit_id, parsed.data.unitId],
    parsedLeaseId.data,
  );

  return {
    leaseId: parsedLeaseId.data,
    message: "Draft lease updated.",
    status: "success",
  };
}

export async function scheduleFutureRentTermAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = parseFutureRentTermInput({
    endDate: readString(formData, "endDate"),
    leaseId: readString(formData, "leaseId"),
    paymentFrequency: readString(formData, "paymentFrequency"),
    rentAmount: readString(formData, "rentAmount"),
    rentDueDay: readString(formData, "rentDueDay"),
    startDate: readString(formData, "startDate"),
    supersedesTermId: readString(formData, "supersedesTermId"),
  });

  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ??
        "Complete the future term before scheduling it.",
      status: "error",
    };
  }

  const idempotencyKey = readIdempotencyKey(formData);

  if (!idempotencyKey) {
    return { message: "Refresh the form and try again.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getLeasePathContext(
    supabase,
    context.organizationId,
    parsed.data.leaseId,
  );

  if (!pathContext) {
    return { message: "We could not find that lease.", status: "error" };
  }

  const { data: termId, error } = await supabase.rpc(
    "schedule_authoritative_lease_term",
    {
      p_end_date: parsed.data.endDate,
      p_idempotency_key: idempotencyKey,
      p_lease_id: parsed.data.leaseId,
      p_organization_id: context.organizationId,
      p_payment_frequency: parsed.data.paymentFrequency,
      p_rent_amount: parsed.data.rentAmount,
      p_rent_currency: "USD",
      p_rent_due_day: parsed.data.rentDueDay,
      p_start_date: parsed.data.startDate,
      p_supersedes_term_id: parsed.data.supersedesTermId,
    },
  );

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [pathContext.property_id],
    [pathContext.unit_id],
    parsed.data.leaseId,
  );

  return {
    leaseId: parsed.data.leaseId,
    message: "Rent schedule updated. Earlier history was kept.",
    status: "success",
    termId,
  };
}

export async function archiveLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsedLeaseId = leaseIdSchema.safeParse(readString(formData, "leaseId"));

  if (!parsedLeaseId.success) {
    return {
      fieldErrors: { leaseId: ["Choose a lease."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getLeasePathContext(
    supabase,
    context.organizationId,
    parsedLeaseId.data,
  );
  const { error } = await supabase.rpc("archive_lease", {
    p_lease_id: parsedLeaseId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message:
        getLeaseMutationErrorMessage(error, "archive") ??
        leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [pathContext?.property_id],
    [pathContext?.unit_id],
    parsedLeaseId.data,
  );

  return {
    message: "Lease archived.",
    status: "success",
  };
}

export async function restoreLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsedLeaseId = leaseIdSchema.safeParse(readString(formData, "leaseId"));

  if (!parsedLeaseId.success) {
    return {
      fieldErrors: { leaseId: ["Choose a lease."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getLeasePathContext(
    supabase,
    context.organizationId,
    parsedLeaseId.data,
  );
  const { error } = await supabase.rpc("restore_lease", {
    p_lease_id: parsedLeaseId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message:
        getLeaseMutationErrorMessage(error, "restore") ??
        leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [pathContext?.property_id],
    [pathContext?.unit_id],
    parsedLeaseId.data,
  );

  return {
    message: "Lease restored.",
    status: "success",
  };
}

function readLeaseMutationInput(formData: FormData) {
  return {
    actualMoveInDate: readString(formData, "actualMoveInDate"),
    actualMoveOutDate: readString(formData, "actualMoveOutDate"),
    depositAmount: readString(formData, "depositAmount"),
    leaseEndDate: readString(formData, "leaseEndDate"),
    leaseStartDate: readString(formData, "leaseStartDate"),
    monthlyRentAmount: readString(formData, "monthlyRentAmount"),
    paymentFrequency: readString(formData, "paymentFrequency"),
    propertyId: readString(formData, "propertyId"),
    rentDueDay: readString(formData, "rentDueDay"),
    scheduledMoveInDate: readString(formData, "scheduledMoveInDate"),
    scheduledMoveOutDate: readString(formData, "scheduledMoveOutDate"),
    status: readString(formData, "status"),
    tenantPersonId: readString(formData, "tenantPersonId"),
    termStatus: readString(formData, "termStatus"),
    unitId: readString(formData, "unitId"),
  };
}

function readIdempotencyKey(formData: FormData) {
  const parsed = parseIdempotencyKey(readString(formData, "idempotencyKey"));
  return parsed.success ? parsed.data : null;
}

async function getLeasePathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  leaseId: string,
) {
  const { data } = await supabase
    .from("current_leases")
    .select("property_id, unit_id")
    .eq("id", leaseId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
}

function revalidateLeasePaths(
  propertyIds: Array<string | null | undefined>,
  unitIds: Array<string | null | undefined>,
  leaseId?: string | null,
) {
  revalidatePath("/overview");
  revalidatePath("/documents");
  revalidatePath("/leases");
  revalidatePath("/ledger");
  revalidatePath("/people");
  revalidatePath("/reports");
  revalidatePath("/tenants");
  revalidatePath("/timeline");
  revalidatePath("/units");
  revalidatePath("/properties");

  for (const propertyId of new Set(propertyIds.filter(Boolean))) {
    revalidatePath(`/properties/${propertyId}`);
  }

  for (const unitId of new Set(unitIds.filter(Boolean))) {
    revalidatePath(`/units/${unitId}`);
  }

  if (leaseId) {
    revalidatePath(`/leases?query=${leaseId}`);
    revalidatePath(`/leases/${leaseId}`);
  }
}

function getLeaseLifecycleSuccessMessage(
  transition: z.infer<typeof leaseLifecycleTransitionSchema>["transition"],
) {
  switch (transition) {
    case "activate":
      return "Lease activated.";
    case "give_notice":
      return "Notice recorded.";
    case "end":
      return "Lease ended.";
    case "terminate":
      return "Lease terminated.";
    case "cancel":
      return "Draft lease cancelled.";
  }
}

function leaseActionErrorMessage(message: string, details?: string | null) {
  const errorMessage = `${message} ${details ?? ""}`;
  if (isLeaseUnitTermConflict(message)) {
    return "This unit is already reserved for those dates.";
  }
  if (message.includes("Tenant not found")) {
    return "Choose an active tenant in this workspace.";
  }

  if (message.includes("Property not found")) {
    return "Choose a property in this workspace.";
  }

  if (message.includes("Unit not found under selected property")) {
    return "Choose a unit under the selected property.";
  }

  if (
    message.includes("Unit already has an open lease") ||
    message.includes("lease_occupancies_one_active_unit_idx")
  ) {
    return "This unit already has an open lease. End or cancel the existing lease before saving another open lease.";
  }

  if (message.includes("Lease not found")) {
    return "We could not find that lease.";
  }

  if (
    message.includes("lease_lifecycle_stale_status") ||
    message.includes("lease_lifecycle_stale_occupancy") ||
    message.includes("lease_lifecycle_scope_changed")
  ) {
    return "This lease changed after the page loaded. Refresh it before trying again.";
  }

  if (message.includes("lease_lifecycle_notice_move_out_required")) {
    return "Choose a planned move-out date on or after the notice date.";
  }

  if (message.includes("lease_lifecycle_reason_required")) {
    return "Add a reason or note with at least 8 characters.";
  }

  if (message.includes("lease_lifecycle_transition_invalid")) {
    return "This action is not available for the lease's current status.";
  }

  if (message.includes("overlaps existing key")) {
    return "These dates overlap another rent period. End the existing period before scheduling this one.";
  }

  if (
    message.includes("conflicting key value violates exclusion constraint") ||
    message.includes("lease_terms_authoritative_effective_range_excl")
  ) {
    return "These dates overlap another authoritative term. Choose a non-overlapping effective range.";
  }

  if (message.includes("future rent change must begin")) {
    return "A future rent change must begin after today and after the active term starts.";
  }

  if (message.includes("reporting period is locked")) {
    return "This term intersects a locked reporting period and cannot be changed.";
  }

  if (message.includes("Authoritative lease term inputs")) {
    return "Complete the due day, frequency, dates, amount, and rent period details.";
  }

  if (message.includes("violates foreign key")) {
    return "Choose valid property and unit records before saving this lease.";
  }

  if (errorMessage.includes("lease_deposit_activity_recorded")) {
    return "This deposit already has recorded activity. Reverse the deposit events before changing the amount.";
  }

  if (message.includes("Not authorized") || message.includes("row-level security")) {
    return "You do not have access to save this lease.";
  }

  return "We could not save the lease. Please check the fields and try again.";
}

function isLeaseUnitTermConflict(message: string) {
  return (
    message.includes("Unit is already reserved for the selected Lease dates") ||
    message.includes("lease_unit_term_conflict")
  );
}

export async function recordLeaseDepositEventAction(_state: LeaseActionState, formData: FormData): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = depositEventSchema.safeParse({ amount: readString(formData, "amount"), eventDate: readString(formData, "eventDate"), eventType: readString(formData, "eventType"), leaseDepositId: readString(formData, "leaseDepositId"), reference: readString(formData, "reference") });
  if (!parsed.success) return invalidFormState(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_lease_deposit_event", { p_organization_id: context.organizationId, p_lease_deposit_id: parsed.data.leaseDepositId, p_event_type: parsed.data.eventType, p_event_date: parsed.data.eventDate, p_amount: parsed.data.amount, p_reference: parsed.data.reference });
  if (error) return { message: leaseActionErrorMessage(error.message), status: "error" };
  revalidatePath("/leases"); revalidatePath("/overview");
  return { message: "Deposit activity saved.", status: "success" };
}

export async function reverseLeaseDepositEventAction(_state: LeaseActionState, formData: FormData): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const eventId = postgresUuid("Choose deposit activity.").safeParse(readString(formData, "eventId"));
  const eventDate = dateSchema.safeParse(readString(formData, "eventDate"));
  if (!eventId.success || !eventDate.success) return { message: "Choose valid deposit activity and a date.", status: "error" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_lease_deposit_event", { p_organization_id: context.organizationId, p_event_id: eventId.data, p_event_date: eventDate.data, p_reference: readString(formData, "reference") });
  if (error) return { message: leaseActionErrorMessage(error.message), status: "error" };
  revalidatePath("/leases"); revalidatePath("/overview");
  return { message: "Deposit activity undone.", status: "success" };
}
