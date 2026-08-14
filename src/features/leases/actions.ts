"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLeaseConfigurationContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getLeaseMutationErrorMessage,
  parseFutureRentTermInput,
  parseIdempotencyKey,
} from "@/features/leases/lease-action-input";
import { buildNewLeaseRelationshipPayload } from "@/features/leases/lease-relationship-input";

type LeaseFieldErrors = {
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

export type RentPolicyActionState = {
  message?: string;
  policyId?: string;
  status?: "error" | "success";
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
const leaseIdSchema = z.uuid("Choose a lease.");
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
const depositEventSchema = z.object({ amount: z.coerce.number().positive("Enter a positive amount."), eventDate: dateSchema, eventType: z.enum(["received", "applied", "retained", "refunded"]), leaseDepositId: z.uuid("Choose a lease deposit."), reference: z.string().trim().max(200) });
const currentOccupancyEvidenceSchema = z
  .object({
    actualMoveInDate: dateSchema,
    leaseId: leaseIdSchema,
    occupancyId: z.uuid("Choose the occupancy evidence to repair."),
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
    expectedOccupancyId: z.uuid("Choose the current occupancy record."),
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

const leaseMutationSchema = z
  .object({
    actualMoveInDate: optionalDateSchema,
    actualMoveOutDate: optionalDateSchema,
    depositAmount: z.string().trim(),
    leaseEndDate: dateSchema,
    leaseStartDate: dateSchema,
    monthlyRentAmount: z.string().trim(),
    paymentFrequency: paymentFrequencySchema,
    propertyId: z.uuid("Choose a property."),
    rentDueDay: z.string().trim(),
    scheduledMoveInDate: optionalDateSchema,
    scheduledMoveOutDate: optionalDateSchema,
    status: leaseStatusSchema,
    tenantPersonId: z.uuid("Choose a tenant."),
    termStatus: termStatusSchema,
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    if (!z.uuid().safeParse(data.unitId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a unit. Authoritative rent terms require one unit.",
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
  const { data: relationshipResult, error } = await supabase.rpc(
    "create_lease_with_relationships",
    {
      ...leaseAuthorityRpcPayload(
        context.organizationId,
        parsed.data,
        idempotencyKey,
      ),
      p_relationship_payload: buildNewLeaseRelationshipPayload({
        actualMoveInDate: parsed.data.actualMoveInDate || undefined,
        actualMoveOutDate: parsed.data.actualMoveOutDate || undefined,
        leaseStatus: parsed.data.status,
        recordSource: "operator_confirmed",
        scheduledMoveInDate: parsed.data.scheduledMoveInDate || undefined,
        scheduledMoveOutDate: parsed.data.scheduledMoveOutDate || undefined,
        tenantPersonId: parsed.data.tenantPersonId,
      }),
    },
  );

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
      message: "The Lease was not returned by the checked relationship write.",
      status: "error",
    };
  }

  revalidateLeasePaths(
    [parsed.data.propertyId],
    [parsed.data.unitId],
    leaseId,
  );

  return {
    leaseId,
    message: "Lease added.",
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
        : "The updated occupancy evidence was not returned.",
      status: "error",
    };
  }

  revalidateLeasePaths([], [], parsed.data.leaseId);
  return {
    leaseId: parsed.data.leaseId,
    message: "Occupancy evidence recorded.",
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
        leaseActionErrorMessage(error.message),
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
    message: "Lease updated.",
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
    message: "Future rent term scheduled. Prior term history was preserved.",
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
  revalidatePath("/reports");
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

function leaseActionErrorMessage(message: string) {
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
    return "Add an evidence note with at least 8 characters.";
  }

  if (message.includes("lease_lifecycle_transition_invalid")) {
    return "This lifecycle change is not available from the lease's current status.";
  }

  if (message.includes("overlaps existing key")) {
    return "These dates overlap another authoritative term. End the existing term before scheduling this one.";
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
    return "Complete the due day, frequency, dates, amount, and term status.";
  }

  if (message.includes("violates foreign key")) {
    return "Choose valid property and unit records before saving this lease.";
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
  return { message: "Deposit event recorded.", status: "success" };
}

export async function reverseLeaseDepositEventAction(_state: LeaseActionState, formData: FormData): Promise<LeaseActionState> {
  const context = await requireLeaseConfigurationContext();
  const eventId = z.uuid().safeParse(readString(formData, "eventId"));
  const eventDate = dateSchema.safeParse(readString(formData, "eventDate"));
  if (!eventId.success || !eventDate.success) return { message: "Choose a valid event and date.", status: "error" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_lease_deposit_event", { p_organization_id: context.organizationId, p_event_id: eventId.data, p_event_date: eventDate.data, p_reference: readString(formData, "reference") });
  if (error) return { message: leaseActionErrorMessage(error.message), status: "error" };
  revalidatePath("/leases"); revalidatePath("/overview");
  return { message: "Deposit event reversed.", status: "success" };
}

export async function createRentPolicyDraftAction(
  _state: RentPolicyActionState,
  formData: FormData,
): Promise<RentPolicyActionState> {
  const context = await requireLeaseConfigurationContext();
  const effectiveFrom = dateSchema.safeParse(
    readString(formData, "effectiveFrom"),
  );

  if (!effectiveFrom.success) {
    return { message: "Choose an effective date.", status: "error" };
  }

  const idempotencyKey = readIdempotencyKey(formData);

  if (!idempotencyKey) {
    return { message: "Refresh the form and try again.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: policyId, error } = await supabase.rpc(
    "create_rent_policy_draft",
    {
      p_effective_from: effectiveFrom.data,
      p_idempotency_key: idempotencyKey,
      p_organization_id: context.organizationId,
    },
  );

  if (error) {
    return { message: leaseActionErrorMessage(error.message), status: "error" };
  }

  revalidatePath("/settings/rent-policy");
  revalidatePath("/leases");
  return {
    message: "Rent-policy draft created. Unresolved rules remain blocked.",
    policyId,
    status: "success",
  };
}

const rentPolicyDraftSchema = z.object({
  concessionsSupportState: z.enum(["supported", "unsupported"]),
  dueDaySource: z.enum(["policy_default", "term"]),
  leaseEndProrationRule: z.enum([
    "actual_days",
    "no_proration",
    "thirty_day",
    "through_move_out",
  ]),
  leaseStartProrationRule: z.enum([
    "actual_days",
    "no_proration",
    "thirty_day",
  ]),
  midPeriodRentChangeRule: z.enum([
    "next_full_period",
    "prorate_actual_days",
    "prorate_thirty_day",
  ]),
  noticePeriodChargingRule: z.enum([
    "stop_on_notice",
    "through_lease_end",
    "through_move_out",
  ]),
  policyDefaultDueDay: z.string().trim(),
  policyId: z.uuid(),
  rentCalculationTimezone: z.string().trim().min(1).max(100),
  rentFreeSupportState: z.enum(["supported", "unsupported"]),
  shortMonthDueDayRule: z.enum([
    "last_calendar_day",
    "next_calendar_month",
  ]),
  supportedFrequencies: z.array(paymentFrequencySchema).min(1),
  waiversSupportState: z.enum(["supported", "unsupported"]),
});

export async function updateRentPolicyDraftAction(
  _state: RentPolicyActionState,
  formData: FormData,
): Promise<RentPolicyActionState> {
  const context = await requireLeaseConfigurationContext();
  const parsed = rentPolicyDraftSchema.safeParse({
    concessionsSupportState: readString(formData, "concessionsSupportState"),
    dueDaySource: readString(formData, "dueDaySource"),
    leaseEndProrationRule: readString(formData, "leaseEndProrationRule"),
    leaseStartProrationRule: readString(formData, "leaseStartProrationRule"),
    midPeriodRentChangeRule: readString(formData, "midPeriodRentChangeRule"),
    noticePeriodChargingRule: readString(
      formData,
      "noticePeriodChargingRule",
    ),
    policyDefaultDueDay: readString(formData, "policyDefaultDueDay"),
    policyId: readString(formData, "policyId"),
    rentCalculationTimezone: readString(
      formData,
      "rentCalculationTimezone",
    ),
    rentFreeSupportState: readString(formData, "rentFreeSupportState"),
    shortMonthDueDayRule: readString(formData, "shortMonthDueDayRule"),
    supportedFrequencies: formData
      .getAll("supportedFrequencies")
      .filter((value): value is string => typeof value === "string"),
    waiversSupportState: readString(formData, "waiversSupportState"),
  });

  if (!parsed.success) {
    return {
      message: "Resolve every policy field before saving.",
      status: "error",
    };
  }

  let defaultDueDay =
    parsed.data.policyDefaultDueDay.length === 0
      ? null
      : Number(parsed.data.policyDefaultDueDay);
  if (parsed.data.dueDaySource === "term") {
    defaultDueDay = null;
  }
  if (
    parsed.data.dueDaySource === "policy_default" &&
    defaultDueDay === null
  ) {
    return {
      message: "Policy default due day must be from 1 to 31.",
      status: "error",
    };
  }
  if (
    defaultDueDay !== null &&
    (!Number.isInteger(defaultDueDay) ||
      defaultDueDay < 1 ||
      defaultDueDay > 31)
  ) {
    return {
      message: "Policy default due day must be from 1 to 31.",
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_rent_policy_draft", {
    p_concessions_support_state: parsed.data.concessionsSupportState,
    p_due_day_source: parsed.data.dueDaySource,
    p_lease_end_proration_rule: parsed.data.leaseEndProrationRule,
    p_lease_start_proration_rule: parsed.data.leaseStartProrationRule,
    p_mid_period_rent_change_rule: parsed.data.midPeriodRentChangeRule,
    p_notice_period_charging_rule: parsed.data.noticePeriodChargingRule,
    p_organization_id: context.organizationId,
    p_policy_default_due_day: defaultDueDay as number,
    p_policy_id: parsed.data.policyId,
    p_rent_calculation_timezone: parsed.data.rentCalculationTimezone,
    p_rent_free_support_state: parsed.data.rentFreeSupportState,
    p_short_month_due_day_rule: parsed.data.shortMonthDueDayRule,
    p_supported_frequencies: parsed.data.supportedFrequencies,
    p_waivers_support_state: parsed.data.waiversSupportState,
  });

  if (error) {
    return { message: leaseActionErrorMessage(error.message), status: "error" };
  }

  revalidatePath("/settings/rent-policy");
  revalidatePath("/leases");
  return {
    message: "Rent-policy draft saved. Approval is still required.",
    policyId: parsed.data.policyId,
    status: "success",
  };
}

export async function approveRentPolicyVersionAction(
  _state: RentPolicyActionState,
  formData: FormData,
): Promise<RentPolicyActionState> {
  const context = await requireLeaseConfigurationContext();
  const policyId = z.uuid().safeParse(readString(formData, "policyId"));
  if (!policyId.success) {
    return { message: "Choose a policy version.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_rent_policy_version", {
    p_organization_id: context.organizationId,
    p_policy_id: policyId.data,
  });

  if (error) {
    return {
      message: error.message.includes("incomplete")
        ? "Resolve every policy rule before approval."
        : leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePath("/settings/rent-policy");
  revalidatePath("/leases");
  return {
    message: "Rent-policy version approved.",
    policyId: policyId.data,
    status: "success",
  };
}
