"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTIVE_UNIT_LEASE_STATUSES } from "@/features/units/data/unit-summary";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";
import { Constants } from "@/types/database";

type LeaseFieldErrors = {
  depositAmount?: string[];
  depositCurrency?: string[];
  leaseEndDate?: string[];
  leaseId?: string[];
  leaseStartDate?: string[];
  monthlyRentAmount?: string[];
  monthlyRentCurrency?: string[];
  propertyId?: string[];
  status?: string[];
  tenantName?: string[];
  unitId?: string[];
};

export type LeaseActionState = {
  fieldErrors?: LeaseFieldErrors;
  message?: string;
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
const leaseIdSchema = z.uuid("Choose a lease.");
const occupancyLeaseStatuses = new Set<string>(ACTIVE_UNIT_LEASE_STATUSES);

type LeaseLinkedUnitRow = {
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  property_id: string;
  size_sqm: number | null;
  status: string;
  unit_number: string;
};

type LinkedUnitOccupancyResult =
  | { message?: never; status: "not-needed" | "updated" }
  | { message: string; status: "needs-review" };

const leaseMutationSchema = z
  .object({
    depositAmount: z.string().trim(),
    depositCurrency: z.string().trim(),
    leaseEndDate: dateSchema,
    leaseStartDate: dateSchema,
    monthlyRentAmount: z.string().trim(),
    monthlyRentCurrency: z.string().trim(),
    propertyId: z.uuid("Choose a property."),
    status: leaseStatusSchema,
    tenantName: z
      .string()
      .trim()
      .min(1, "Enter a tenant name.")
      .max(160, "Keep the tenant name under 160 characters."),
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    if (data.unitId.length > 0 && !z.uuid().safeParse(data.unitId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid unit.",
        path: ["unitId"],
      });
    }

    const rentAmount = Number(data.monthlyRentAmount);

    if (!Number.isFinite(rentAmount) || rentAmount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid non-negative rent amount.",
        path: ["monthlyRentAmount"],
      });
    }

    const rentCurrency = z
      .enum(Constants.public.Enums.currency_code)
      .safeParse(data.monthlyRentCurrency);

    if (!rentCurrency.success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid rent currency.",
        path: ["monthlyRentCurrency"],
      });
    }

    if (data.leaseEndDate < data.leaseStartDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after the start date.",
        path: ["leaseEndDate"],
      });
    }

    const hasDepositAmount = data.depositAmount.length > 0;
    const hasDepositCurrency = data.depositCurrency.length > 0;

    if (!hasDepositAmount && !hasDepositCurrency) {
      return;
    }

    if (!hasDepositAmount || !hasDepositCurrency) {
      context.addIssue({
        code: "custom",
        message: "Enter both deposit amount and currency.",
        path: hasDepositAmount ? ["depositCurrency"] : ["depositAmount"],
      });
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

    const depositCurrency = z
      .enum(Constants.public.Enums.currency_code)
      .safeParse(data.depositCurrency);

    if (!depositCurrency.success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid deposit currency.",
        path: ["depositCurrency"],
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

function nullableUuid(value: string) {
  return value.length > 0 ? value : null;
}

function nullableCurrency(value: string) {
  return value.length > 0 ? (value as CurrencyCode) : null;
}

export async function createLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireAdminContext();
  const parsed = leaseMutationSchema.safeParse(readLeaseMutationInput(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const scopeState = await validateLeaseScope(
    supabase,
    context.organizationId,
    parsed.data.propertyId,
    nullableUuid(parsed.data.unitId),
  );

  if (scopeState) {
    return scopeState;
  }

  const { data, error } = await supabase
    .from("leases")
    .insert({
      created_by: context.userId,
      deposit_amount: nullableNumber(parsed.data.depositAmount),
      deposit_currency: nullableCurrency(parsed.data.depositCurrency),
      lease_end_date: parsed.data.leaseEndDate,
      lease_start_date: parsed.data.leaseStartDate,
      monthly_rent_amount: Number(parsed.data.monthlyRentAmount),
      monthly_rent_currency: parsed.data.monthlyRentCurrency as CurrencyCode,
      organization_id: context.organizationId,
      property_id: parsed.data.propertyId,
      status: parsed.data.status,
      tenant_name: parsed.data.tenantName,
      unit_id: nullableUuid(parsed.data.unitId),
      updated_by: context.userId,
    })
    .select("id")
    .single();

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  const occupancyResult = await markLinkedUnitOccupiedIfNeeded(
    supabase,
    context.organizationId,
    nullableUuid(parsed.data.unitId),
    parsed.data.status,
  );
  revalidateLeasePaths([parsed.data.propertyId], [parsed.data.unitId], data.id);

  return {
    message: getLeaseSuccessMessage("Lease added.", occupancyResult),
    status: "success",
  };
}

export async function updateLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireAdminContext();
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

  const scopeState = await validateLeaseScope(
    supabase,
    context.organizationId,
    parsed.data.propertyId,
    nullableUuid(parsed.data.unitId),
  );

  if (scopeState) {
    return scopeState;
  }

  const { error } = await supabase
    .from("leases")
    .update({
      deposit_amount: nullableNumber(parsed.data.depositAmount),
      deposit_currency: nullableCurrency(parsed.data.depositCurrency),
      lease_end_date: parsed.data.leaseEndDate,
      lease_start_date: parsed.data.leaseStartDate,
      monthly_rent_amount: Number(parsed.data.monthlyRentAmount),
      monthly_rent_currency: parsed.data.monthlyRentCurrency as CurrencyCode,
      property_id: parsed.data.propertyId,
      status: parsed.data.status,
      tenant_name: parsed.data.tenantName,
      unit_id: nullableUuid(parsed.data.unitId),
      updated_by: context.userId,
    })
    .eq("id", parsedLeaseId.data)
    .eq("organization_id", context.organizationId);

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  const occupancyResult = await markLinkedUnitOccupiedIfNeeded(
    supabase,
    context.organizationId,
    nullableUuid(parsed.data.unitId),
    parsed.data.status,
  );
  revalidateLeasePaths(
    [pathContext.property_id, parsed.data.propertyId],
    [pathContext.unit_id, parsed.data.unitId],
    parsedLeaseId.data,
  );

  return {
    message: getLeaseSuccessMessage("Lease updated.", occupancyResult),
    status: "success",
  };
}

export async function archiveLeaseAction(
  _state: LeaseActionState,
  formData: FormData,
): Promise<LeaseActionState> {
  const context = await requireAdminContext();
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
  const { error } = await supabase
    .from("leases")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: context.userId,
      updated_by: context.userId,
    })
    .eq("id", parsedLeaseId.data)
    .eq("organization_id", context.organizationId);

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
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
  const context = await requireAdminContext();
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
  const { error } = await supabase
    .from("leases")
    .update({
      archived_at: null,
      archived_by: null,
      updated_by: context.userId,
    })
    .eq("id", parsedLeaseId.data)
    .eq("organization_id", context.organizationId);

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
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
    depositAmount: readString(formData, "depositAmount"),
    depositCurrency: readString(formData, "depositCurrency"),
    leaseEndDate: readString(formData, "leaseEndDate"),
    leaseStartDate: readString(formData, "leaseStartDate"),
    monthlyRentAmount: readString(formData, "monthlyRentAmount"),
    monthlyRentCurrency: readString(formData, "monthlyRentCurrency"),
    propertyId: readString(formData, "propertyId"),
    status: readString(formData, "status"),
    tenantName: readString(formData, "tenantName"),
    unitId: readString(formData, "unitId"),
  };
}

async function validateLeaseScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  propertyId: string,
  unitId: string | null,
): Promise<LeaseActionState | null> {
  const propertyResult = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (propertyResult.error || !propertyResult.data) {
    return {
      fieldErrors: { propertyId: ["Choose a property in this workspace."] },
      status: "error",
    };
  }

  if (!unitId) {
    return null;
  }

  const unitResult = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", unitId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (unitResult.error || !unitResult.data) {
    return {
      fieldErrors: { unitId: ["Choose a unit in this workspace."] },
      status: "error",
    };
  }

  if (unitResult.data.property_id !== propertyId) {
    return {
      fieldErrors: { unitId: ["Choose a unit under the selected property."] },
      status: "error",
    };
  }

  return null;
}

async function getLeasePathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  leaseId: string,
) {
  const { data } = await supabase
    .from("leases")
    .select("property_id, unit_id")
    .eq("id", leaseId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
}

async function markLinkedUnitOccupiedIfNeeded(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  unitId: string | null,
  leaseStatus: string,
): Promise<LinkedUnitOccupancyResult> {
  if (!unitId || !occupancyLeaseStatuses.has(leaseStatus)) {
    return { status: "not-needed" };
  }

  const { data, error } = await supabase
    .from("units")
    .select(
      "current_rent_amount, current_rent_currency, floor, property_id, size_sqm, status, unit_number",
    )
    .eq("id", unitId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return {
      message:
        "Lease saved, but the linked unit status could not be checked. Review the unit status before relying on vacancy totals.",
      status: "needs-review",
    };
  }

  const unit = data as LeaseLinkedUnitRow;

  if (unit.status.trim().toLowerCase() !== "vacant") {
    return { status: "not-needed" };
  }

  const updateResult = await supabase.rpc("update_unit", {
    p_current_rent_amount: unit.current_rent_amount,
    p_current_rent_currency: unit.current_rent_currency,
    p_floor: unit.floor,
    p_organization_id: organizationId,
    p_property_id: unit.property_id,
    p_size_sqm: unit.size_sqm,
    p_status: "occupied",
    p_unit_id: unitId,
    p_unit_number: unit.unit_number,
  });

  if (updateResult.error) {
    return {
      message:
        "Lease saved, but the linked vacant unit could not be marked occupied. Open the unit and update its status.",
      status: "needs-review",
    };
  }

  return { status: "updated" };
}

function getLeaseSuccessMessage(
  baseMessage: string,
  occupancyResult: LinkedUnitOccupancyResult,
) {
  return occupancyResult.status === "needs-review"
    ? occupancyResult.message
    : baseMessage;
}

function revalidateLeasePaths(
  propertyIds: Array<string | null | undefined>,
  unitIds: Array<string | null | undefined>,
  leaseId?: string | null,
) {
  revalidatePath("/overview");
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
  }
}

function leaseActionErrorMessage(message: string) {
  if (message.includes("violates foreign key")) {
    return "Choose valid property and unit records before saving this lease.";
  }

  if (message.includes("row-level security")) {
    return "You do not have access to save this lease.";
  }

  return "We could not save the lease. Please check the fields and try again.";
}
