"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type LeaseFieldErrors = {
  depositAmount?: string[];
  leaseEndDate?: string[];
  leaseId?: string[];
  leaseStartDate?: string[];
  monthlyRentAmount?: string[];
  propertyId?: string[];
  status?: string[];
  tenantPersonId?: string[];
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

const leaseMutationSchema = z
  .object({
    depositAmount: z.string().trim(),
    leaseEndDate: dateSchema,
    leaseStartDate: dateSchema,
    monthlyRentAmount: z.string().trim(),
    propertyId: z.uuid("Choose a property."),
    status: leaseStatusSchema,
    tenantPersonId: z.uuid("Choose a tenant."),
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

    if (data.leaseEndDate <= data.leaseStartDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be after the start date.",
        path: ["leaseEndDate"],
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

function nullableUuid(value: string) {
  return value.length > 0 ? value : null;
}

function leaseRpcPayload(
  organizationId: string,
  values: z.infer<typeof leaseMutationSchema>,
) {
  return {
    p_deposit_amount: nullableNumber(values.depositAmount),
    p_deposit_currency: values.depositAmount.length > 0 ? "USD" : null,
    p_lease_end_date: values.leaseEndDate,
    p_lease_start_date: values.leaseStartDate,
    p_monthly_rent_amount: Number(values.monthlyRentAmount),
    p_monthly_rent_currency: "USD",
    p_organization_id: organizationId,
    p_primary_tenant_person_id: values.tenantPersonId,
    p_property_id: values.propertyId,
    p_status: values.status,
    p_unit_id: nullableUuid(values.unitId),
  } as const;
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
  const { data: leaseId, error } = await supabase.rpc("create_lease", {
    ...leaseRpcPayload(context.organizationId, parsed.data),
  });

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [parsed.data.propertyId],
    [parsed.data.unitId],
    leaseId,
  );

  return {
    message: "Lease added.",
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

  const { error } = await supabase.rpc("update_lease", {
    ...leaseRpcPayload(context.organizationId, parsed.data),
    p_lease_id: parsedLeaseId.data,
  });

  if (error) {
    return {
      message: leaseActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLeasePaths(
    [pathContext.property_id, parsed.data.propertyId],
    [pathContext.unit_id, parsed.data.unitId],
    parsedLeaseId.data,
  );

  return {
    message: "Lease updated.",
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
  const { error } = await supabase.rpc("archive_lease", {
    p_lease_id: parsedLeaseId.data,
    p_organization_id: context.organizationId,
  });

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
  const { error } = await supabase.rpc("restore_lease", {
    p_lease_id: parsedLeaseId.data,
    p_organization_id: context.organizationId,
  });

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
    leaseEndDate: readString(formData, "leaseEndDate"),
    leaseStartDate: readString(formData, "leaseStartDate"),
    monthlyRentAmount: readString(formData, "monthlyRentAmount"),
    propertyId: readString(formData, "propertyId"),
    status: readString(formData, "status"),
    tenantPersonId: readString(formData, "tenantPersonId"),
    unitId: readString(formData, "unitId"),
  };
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
  }
}

function leaseActionErrorMessage(message: string) {
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

  if (message.includes("violates foreign key")) {
    return "Choose valid property and unit records before saving this lease.";
  }

  if (message.includes("Not authorized") || message.includes("row-level security")) {
    return "You do not have access to save this lease.";
  }

  return "We could not save the lease. Please check the fields and try again.";
}
