"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import {
  isPrivilegedStepUpRequiredError,
  privilegedStepUpRequiredActionMessage,
} from "@/lib/auth/privileged-step-up-error";
import { createSupabaseServerClient } from "@/lib/db/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import {
  getLeaseMutationErrorMessage,
  parseFutureRentTermInput,
  parseIdempotencyKey,
} from "@/features/leases/lease-action-input";
import { buildNewLeaseRelationshipPayload } from "@/features/leases/lease-relationship-input";
import {
  leaseBillingRuleSchema,
  leaseBillingRuleShape,
  readLeaseBillingRuleInput,
  toLeaseBillingRulePayload,
} from "@/features/leases/lease-billing-rule-input";
import type { LeaseBillingRuleFieldErrors } from "@/features/leases/lease.types";

type LeaseFieldErrors = LeaseBillingRuleFieldErrors & {
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
  depositReceived?: string[];
  depositReceivedAmount?: string[];
  depositReceivedOn?: string[];
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
const depositEventSchema = z.object({
  amount: z.coerce.number().positive("Enter a positive amount."),
  eventDate: dateSchema,
  eventType: z.enum(["received", "retained", "refunded"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  leaseDepositId: postgresUuid("Choose a lease deposit."),
  liabilityAccountId: postgresUuid("Choose a deposit liability account."),
  reference: z.string().trim().max(200),
});
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
    ...leaseBillingRuleShape,
    actualMoveInDate: optionalDateSchema,
    actualMoveOutDate: optionalDateSchema,
    depositAmount: z.string().trim(),
    depositReceived: z.enum(["no", "yes"]),
    depositReceivedAmount: z.string().trim(),
    depositReceivedOn: optionalDateSchema,
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

    const depositAmount = Number(data.depositAmount);
    const depositAmountIsValid =
      data.depositAmount.length === 0 ||
      (Number.isFinite(depositAmount) && depositAmount >= 0);

    if (!depositAmountIsValid) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid non-negative deposit.",
        path: ["depositAmount"],
      });
    }

    if (data.depositReceived === "yes") {
      if (!depositAmountIsValid || data.depositAmount.length === 0 || depositAmount <= 0) {
        context.addIssue({
          code: "custom",
          message: "Enter the required deposit before recording its receipt.",
          path: ["depositAmount"],
        });
      }

      const receivedAmount = Number(
        data.depositReceivedAmount || data.depositAmount,
      );

      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
        context.addIssue({
          code: "custom",
          message: "Enter a received amount greater than zero.",
          path: ["depositReceivedAmount"],
        });
      } else if (
        Number.isFinite(depositAmount) &&
        receivedAmount > depositAmount
      ) {
        context.addIssue({
          code: "custom",
          message: "Received amount cannot exceed the required deposit.",
          path: ["depositReceivedAmount"],
        });
      }

      if (!data.depositReceivedOn) {
        context.addIssue({
          code: "custom",
          message: "Choose when the deposit was received.",
          path: ["depositReceivedOn"],
        });
      }
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
  const enteredDepositAmount = nullableNumber(values.depositAmount);
  const depositAmount =
    enteredDepositAmount !== null && enteredDepositAmount > 0
      ? enteredDepositAmount
      : null;
  return {
    // Supabase's generated RPC signature cannot express nullable SQL
    // parameters, but the database contract intentionally accepts NULL here.
    p_deposit_amount: depositAmount as number,
    p_deposit_currency: (depositAmount === null ? null : "USD") as "USD",
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
    p_unit_id: (values.unitId || null) as string,
  } as const;
}

function leaseDepositReceiptRpcPayload(
  values: z.infer<typeof leaseMutationSchema>,
) {
  const depositReceived = values.depositReceived === "yes";
  const depositReceivedAmount = depositReceived
    ? Number(values.depositReceivedAmount || values.depositAmount)
    : null;

  return {
    // Supabase's generated RPC signature cannot express nullable SQL
    // parameters, but the database contract intentionally accepts NULL here.
    p_deposit_received: depositReceived,
    p_deposit_received_amount: depositReceivedAmount as number,
    p_deposit_received_on: depositReceived
      ? values.depositReceivedOn
      : (null as unknown as string),
  } as const;
}

export async function createLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requirePermission("leases.prepare");
  const parsed = leaseMutationSchema.safeParse(readLeaseMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  if (parsed.data.status === "active") {
    await requirePermission("leases.activate");
  } else if (
    ["cancelled", "ended", "notice_given", "terminated"].includes(
      parsed.data.status,
    )
  ) {
    await requirePermission("leases.close");
  }

  if (parsed.data.depositReceived === "yes") {
    await requirePermission("leases.change_terms");
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
  const { data: relationshipResult, error } = await supabase.rpc(
    "create_lease_with_deposit_receipt",
    {
      ...authorityPayload,
      ...leaseDepositReceiptRpcPayload(parsed.data),
      p_billing_rule: toLeaseBillingRulePayload(parsed.data),
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
    if (isPrivilegedStepUpRequiredError(error)) {
      return {
        message: privilegedStepUpRequiredActionMessage,
        status: "error",
      };
    }
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
      message: leaseActionErrorMessage(error),
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
  const context = await requirePermission("leases.activate");
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
        ? leaseActionErrorMessage(error)
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

  const context = await requirePermission(
    parsed.data.transition === "activate" ? "leases.activate" : "leases.close",
  );

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
        ? leaseActionErrorMessage(error)
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

export async function renewAndActivateDraftLeaseAction(
  _state: LeaseActionState, formData: FormData,
): Promise<LeaseActionState> {
  const context = await requirePermission("leases.activate");
  await requirePermission("leases.change_terms");
  const parsed = z.object({
    termId: postgresUuid("Refresh the lease before renewing."),
    leaseId: leaseIdSchema, occupancyId: postgresUuid("Choose the recorded occupancy."),
    moveInDate: dateSchema, renewalEndDate: dateSchema,
    rentAmount: z.coerce.number().positive(),
    idempotencyKey: z.string().min(8).max(200),
    confirmed: z.literal("on"),
  }).safeParse({
    termId: readString(formData, "expectedTermId"),
    leaseId: readString(formData, "leaseId"),
    occupancyId: readString(formData, "expectedOccupancyId"),
    moveInDate: readString(formData, "activationDate"),
    renewalEndDate: readString(formData, "renewalEndDate"),
    rentAmount: readString(formData, "renewalRentAmount"),
    idempotencyKey: readString(formData, "idempotencyKey"),
    confirmed: readString(formData, "confirmRenewal"),
  });
  if (!parsed.success) return { ...invalidFormState(parsed.error), message: "Complete the dates, amounts, and confirmation before saving." };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("renew_and_activate_draft_lease", {
    p_organization_id: context.organizationId, p_lease_id: parsed.data.leaseId,
    p_expected_occupancy_id: parsed.data.occupancyId, p_move_in_date: parsed.data.moveInDate,
    p_renewal_end_date: parsed.data.renewalEndDate, p_rent_amount: parsed.data.rentAmount,
    p_idempotency_key: parsed.data.idempotencyKey, p_expected_term_id: parsed.data.termId,
  });
  if (error) return { status: "error", message: leaseActionErrorMessage(error) };
  if (!data || typeof data !== "object" || Array.isArray(data) || data.status !== "active") {
    return { status: "error", message: "The renewed lease was not returned." };
  }
  revalidateLeasePaths([], [], parsed.data.leaseId);
  return { status: "success", leaseId: parsed.data.leaseId, message: "Lease renewed and activated. Original rent history retained." };
}

export async function recordCompletedDraftLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requirePermission("leases.activate");
  await requirePermission("leases.close");
  const parsed = z.object({
    confirmed: z.literal("on"),
    leaseId: leaseIdSchema,
    occupancyId: postgresUuid("Choose the recorded occupancy."),
    moveInDate: dateSchema,
    moveOutDate: dateSchema,
    reason: z.string().trim().min(8, "Add a short explanation."),
    idempotencyKey: z.string().min(8).max(200),
  }).safeParse({
    confirmed: readString(formData, "confirmHistory"),
    leaseId: readString(formData, "leaseId"),
    occupancyId: readString(formData, "expectedOccupancyId"),
    moveInDate: readString(formData, "activationDate"),
    moveOutDate: readString(formData, "moveOutDate"),
    reason: readString(formData, "reason"),
    idempotencyKey: readString(formData, "idempotencyKey"),
  });
  if (!parsed.success) return { ...invalidFormState(parsed.error), message: "Complete the dates, amounts, and confirmation before saving." };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("record_completed_draft_lease", {
    p_organization_id: context.organizationId,
    p_lease_id: parsed.data.leaseId,
    p_expected_status: "draft",
    p_expected_occupancy_id: parsed.data.occupancyId,
    p_transition: "end",
    p_effective_date: parsed.data.moveOutDate,
    p_scheduled_move_out_date: null as unknown as string,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_move_in_date: parsed.data.moveInDate,
  });
  if (error) return { status: "error", message: leaseActionErrorMessage(error) };
  if (!data || typeof data !== "object" || Array.isArray(data) || data.status !== "ended") {
    return { status: "error", message: "The completed lease was not returned." };
  }
  revalidateLeasePaths([], [], parsed.data.leaseId);
  return { status: "success", leaseId: parsed.data.leaseId, message: "Historical lease recorded as ended." };
}

export async function scheduleLeaseActivationAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requirePermission("leases.activate");
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
        ? leaseActionErrorMessage(error)
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
  const context = await requirePermission("leases.activate");
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
    return { message: leaseActionErrorMessage(error), status: "error" };
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
  const context = await requirePermission("leases.prepare");
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
    "update_lease_with_billing_rules",
    {
      ...leaseAuthorityRpcPayload(
        context.organizationId,
        parsed.data,
        idempotencyKey,
      ),
      p_billing_rule: toLeaseBillingRulePayload(parsed.data),
      p_lease_id: parsedLeaseId.data,
    },
  );

  if (error) {
    if (isPrivilegedStepUpRequiredError(error)) {
      return {
        message: privilegedStepUpRequiredActionMessage,
        status: "error",
      };
    }
    return {
      message:
        getLeaseMutationErrorMessage(error, "update") ??
        leaseActionErrorMessage(error),
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

export async function saveLeaseBillingRulesAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requirePermission("leases.change_terms");
  const parsedLeaseId = leaseIdSchema.safeParse(readString(formData, "leaseId"));
  const parsedExpectedRuleId = z
    .preprocess(
      (value) => value || null,
      postgresUuid("Choose the current billing rule.").nullable(),
    )
    .safeParse(readString(formData, "expectedCurrentBillingRuleId"));
  const parsedRule = leaseBillingRuleSchema.safeParse(
    readLeaseBillingRuleInput(formData),
  );

  if (!parsedLeaseId.success) {
    return { fieldErrors: { leaseId: ["Choose a lease."] }, status: "error" };
  }
  if (!parsedExpectedRuleId.success) {
    return {
      message: "Refresh the billing rules and try again.",
      status: "error",
    };
  }
  if (!parsedRule.success) {
    return invalidFormState(parsedRule.error);
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
  const { error } = await supabase.rpc("save_lease_billing_rules", {
    p_billing_rule: toLeaseBillingRulePayload(parsedRule.data),
    p_expected_current_billing_rule_id: parsedExpectedRuleId.data as string,
    p_idempotency_key: idempotencyKey,
    p_lease_id: parsedLeaseId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: leaseActionErrorMessage(error),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [pathContext?.property_id],
    [pathContext?.unit_id],
    parsedLeaseId.data,
  );
  revalidatePath("/finance");
  revalidatePath("/rent-income");
  return {
    leaseId: parsedLeaseId.data,
    message: "Billing rules saved.",
    status: "success",
  };
}

export async function scheduleFutureRentTermAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requirePermission("leases.change_terms");
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
        "Complete the rent change details.",
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
      message: leaseActionErrorMessage(error),
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
  const context = await requirePermission("leases.archive");
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
        leaseActionErrorMessage(error),
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
  const context = await requirePermission("leases.archive");
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
        leaseActionErrorMessage(error),
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
    ...readLeaseBillingRuleInput(formData),
    actualMoveInDate: readString(formData, "actualMoveInDate"),
    actualMoveOutDate: readString(formData, "actualMoveOutDate"),
    depositAmount: readString(formData, "depositAmount"),
    depositReceived: readString(formData, "depositReceived") || "no",
    depositReceivedAmount: readString(formData, "depositReceivedAmount"),
    depositReceivedOn: readString(formData, "depositReceivedOn"),
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

function leaseActionErrorMessage(error: {
  code?: string;
  details?: string | null;
  message: string;
}) {
  if (isPrivilegedStepUpRequiredError(error)) {
    return privilegedStepUpRequiredActionMessage;
  }

  const { details, message } = error;
  const errorMessage = `${message} ${details ?? ""}`;
  if (errorMessage.includes("lease_renewal_dates_invalid")) {
    return "Choose the actual move-in date within the original term, a renewal end date on or after today, and a positive rent amount.";
  }
  if (errorMessage.includes("lease_history_dates_invalid") || errorMessage.includes("lease_history_dates_outside_term")) {
    return "Choose actual move-in and move-out dates within the recorded term. Move-out must be on or after move-in and cannot be in the future.";
  }
  if (errorMessage.includes("lease_activation_outside_term")) {
    return "Choose an activation date within the lease term. If the term has ended, confirm whether the tenant moved out or needs a renewal.";
  }
  if (errorMessage.includes("lease_activation_date_in_past")) {
    return "This activation request does not support a past date yet. Keep the original move-in date and review the lease history before activating.";
  }
  if (errorMessage.includes("lease_activation_billing_rules_required")) {
    return "Complete the billing setup for the selected activation date, then try again.";
  }
  if (errorMessage.includes("lease_activation_stale_status") || errorMessage.includes("lease_activation_stale_occupancy")) {
    return "This lease changed after the page loaded. Refresh it before trying again.";
  }
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
    errorMessage.includes("Lease scope is not supported or no longer exists")
  ) {
    return "This lease is no longer linked to a supported property or unit. Refresh the lease before trying again.";
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

  if (message.includes("rent_change_must_follow_term_start")) {
    return "Choose a month within the active term. Use Correct historical rent for an earlier term.";
  }
  if (errorMessage.includes("issued_rent_change_requires_month_start")) {
    return "Choose the first day of the month to update issued rent. Issued periods currently require monthly billing.";
  }
  if (errorMessage.includes("issued_rent_change_source_unsupported")) {
    return "This issued rent uses an older billing calculation. Review its exact charge before changing the schedule. Nothing was changed.";
  }
  if (errorMessage.includes("issued_rent_change_prorated")) {
    return "This month has an agreed prorated charge. Use Correct historical rent to enter the exact charge for that month, then change the ongoing rent from the next full month.";
  }
  if (errorMessage.includes("issued_rent_change_period_mismatch")) {
    return "The term end date must cover the complete issued rent period. For a one-off final-month amount, use Correct historical rent instead.";
  }
  if (errorMessage.includes("rent_change_requires_linked_review") || errorMessage.includes("historical_rent_correction_blocked")) {
    const detail = error.details ?? "";
    if (detail.includes("historical_rent_tenant_credit_unsupported")) return "The new rent is below the amount already collected. Resolve the excess payment before reducing this month's rent.";
    if (detail.includes("historical_rent_dependent_owner_cash")) return "This rent has already been used for an expense or a transfer to the owner. Review those transactions before changing the rent. Nothing was changed.";
    if (detail.includes("owner_close") || detail.includes("financial_month_locked")) return "An affected financial month is closed. Reopen that month before changing its rent. Nothing was changed.";
    return "A linked payment needs review before this rent can change. Open the issued rent correction preview for details. Nothing was changed.";
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

  if (errorMessage.includes("Active term changed while scheduling its replacement")) {
    return "The rent schedule changed after this form opened. Refresh the Lease and review the current term before trying again.";
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
  const context = await requirePermission("leases.change_terms");
  const parsed = depositEventSchema.safeParse({ amount: readString(formData, "amount"), eventDate: readString(formData, "eventDate"), eventType: readString(formData, "eventType"), idempotencyKey: readString(formData, "idempotencyKey"), leaseDepositId: readString(formData, "leaseDepositId"), liabilityAccountId: readString(formData, "liabilityAccountId"), reference: readString(formData, "reference") });
  if (!parsed.success) return invalidFormState(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_lease_deposit_event_idempotent", { p_organization_id: context.organizationId, p_lease_deposit_id: parsed.data.leaseDepositId, p_liability_account_id: parsed.data.liabilityAccountId, p_event_type: parsed.data.eventType, p_event_date: parsed.data.eventDate, p_amount: parsed.data.amount, p_reference: parsed.data.reference, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) return {
    message: error.message.includes("Conflicting financial idempotency request")
      ? "This request was already saved with different details. Refresh the deposit history before trying again."
      : leaseActionErrorMessage(error),
    status: "error",
  };
  revalidatePath("/leases"); revalidatePath("/overview"); revalidatePath("/ledger"); revalidatePath("/timeline");
  return { message: "Deposit activity saved.", status: "success" };
}

export async function reverseLeaseDepositEventAction(_state: LeaseActionState, formData: FormData): Promise<LeaseActionState> {
  const context = await requirePermission("leases.change_terms");
  const eventId = postgresUuid("Choose deposit activity.").safeParse(readString(formData, "eventId"));
  const eventDate = dateSchema.safeParse(readString(formData, "eventDate"));
  if (!eventId.success || !eventDate.success) return { message: "Choose valid deposit activity and a date.", status: "error" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_lease_deposit_event", { p_organization_id: context.organizationId, p_event_id: eventId.data, p_event_date: eventDate.data, p_reference: readString(formData, "reference") });
  if (error) return { message: leaseActionErrorMessage(error), status: "error" };
  revalidatePath("/leases"); revalidatePath("/overview");
  return { message: "Deposit entry reversed.", status: "success" };
}
