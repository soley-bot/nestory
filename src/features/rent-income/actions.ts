"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type RentIncomeFieldErrors = {
  amountDue?: string[];
  amountReceived?: string[];
  description?: string[];
  dueDate?: string[];
  incomeItemId?: string[];
  incomeType?: string[];
  leaseId?: string[];
  payerLabel?: string[];
  propertyId?: string[];
  receivedDate?: string[];
  reference?: string[];
  unitId?: string[];
};

export type RentIncomeActionState = {
  fieldErrors?: RentIncomeFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const optionalUuidSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || z.uuid().safeParse(value).success, {
    message: "Choose a valid record.",
  });

const incomeItemIdSchema = z.uuid("Choose an income row.");
const createIncomeSchema = z
  .object({
    amountDue: z.string().trim(),
    amountReceived: z.string().trim(),
    description: z.string().trim().max(1200, "Keep the description under 1,200 characters."),
    dueDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
    incomeType: z.enum([
      "rent",
      "security_deposit",
      "utility_reimbursement",
      "parking",
      "late_fee",
      "owner_contribution",
      "other",
    ]),
    leaseId: optionalUuidSchema,
    payerLabel: z
      .string()
      .trim()
      .min(2, "Enter who this income is from.")
      .max(120, "Keep the payer under 120 characters."),
    propertyId: z.uuid("Choose a property."),
    receivedDate: z.string().trim(),
    reference: z.string().trim().max(120, "Keep the reference under 120 characters."),
    unitId: optionalUuidSchema,
  })
  .superRefine((data, context) => {
    const amountDue = Number(data.amountDue);
    const amountReceived = Number(data.amountReceived || "0");

    if (!Number.isFinite(amountDue) || amountDue < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid expected amount.",
        path: ["amountDue"],
      });
    }

    if (!Number.isFinite(amountReceived) || amountReceived < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid received amount.",
        path: ["amountReceived"],
      });
    }

    if (amountDue <= 0 && amountReceived <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter an expected or received amount.",
        path: ["amountDue"],
      });
    }

    if (
      data.receivedDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(data.receivedDate)
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a received date.",
        path: ["receivedDate"],
      });
    }
  });

const recordPaymentSchema = z
  .object({
    amountReceived: z.string().trim(),
    incomeItemId: incomeItemIdSchema,
    receivedDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a received date."),
    reference: z.string().trim().max(120, "Keep the reference under 120 characters."),
  })
  .superRefine((data, context) => {
    const amountReceived = Number(data.amountReceived);

    if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter an amount greater than zero.",
        path: ["amountReceived"],
      });
    }
  });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): RentIncomeActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as RentIncomeFieldErrors,
    status: "error",
  };
}

export async function createRentIncomeItemAction(
  _state: RentIncomeActionState,
  formData: FormData,
): Promise<RentIncomeActionState> {
  const context = await requireAdminContext();
  const parsed = createIncomeSchema.safeParse({
    amountDue: readString(formData, "amountDue"),
    amountReceived: readString(formData, "amountReceived"),
    description: readString(formData, "description"),
    dueDate: readString(formData, "dueDate"),
    incomeType: readString(formData, "incomeType"),
    leaseId: readString(formData, "leaseId"),
    payerLabel: readString(formData, "payerLabel"),
    propertyId: readString(formData, "propertyId"),
    receivedDate: readString(formData, "receivedDate"),
    reference: readString(formData, "reference"),
    unitId: readString(formData, "unitId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_finance_income_item", {
    p_amount_due: Number(parsed.data.amountDue),
    p_amount_received: Number(parsed.data.amountReceived || "0"),
    p_description: parsed.data.description || null,
    p_due_date: parsed.data.dueDate,
    p_income_type: parsed.data.incomeType,
    p_lease_id: parsed.data.leaseId || null,
    p_organization_id: context.organizationId,
    p_payer_label: parsed.data.payerLabel,
    p_property_id: parsed.data.propertyId,
    p_received_date: parsed.data.receivedDate || null,
    p_reference: parsed.data.reference || null,
    p_unit_id: parsed.data.unitId || null,
  });

  if (error) {
    return {
      message: financeIncomeErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateFinanceIncomePaths(parsed.data.propertyId, parsed.data.unitId || null);

  return {
    message: "Income row created.",
    status: "success",
  };
}

export async function recordRentIncomePaymentAction(
  _state: RentIncomeActionState,
  formData: FormData,
): Promise<RentIncomeActionState> {
  const context = await requireAdminContext();
  const parsed = recordPaymentSchema.safeParse({
    amountReceived: readString(formData, "amountReceived"),
    incomeItemId: readString(formData, "incomeItemId"),
    receivedDate: readString(formData, "receivedDate"),
    reference: readString(formData, "reference"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_finance_income_payment", {
    p_amount_received: Number(parsed.data.amountReceived),
    p_income_item_id: parsed.data.incomeItemId,
    p_organization_id: context.organizationId,
    p_received_date: parsed.data.receivedDate,
    p_reference: parsed.data.reference || null,
  });

  if (error) {
    return {
      message: financeIncomeErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateFinanceIncomePaths();

  return {
    message: "Received money recorded.",
    status: "success",
  };
}

export async function postRentIncomeItemAction(
  _state: RentIncomeActionState,
  formData: FormData,
): Promise<RentIncomeActionState> {
  const context = await requireAdminContext();
  const parsedIncomeItemId = incomeItemIdSchema.safeParse(
    readString(formData, "incomeItemId"),
  );

  if (!parsedIncomeItemId.success) {
    return {
      fieldErrors: { incomeItemId: ["Choose an income row."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_finance_income_item", {
    p_income_item_id: parsedIncomeItemId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: financeIncomeErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateFinanceIncomePaths();

  return {
    message: "Income posted to ledger.",
    status: "success",
  };
}

export async function voidRentIncomeItemAction(
  _state: RentIncomeActionState,
  formData: FormData,
): Promise<RentIncomeActionState> {
  const context = await requireAdminContext();
  const parsedIncomeItemId = incomeItemIdSchema.safeParse(
    readString(formData, "incomeItemId"),
  );

  if (!parsedIncomeItemId.success) {
    return {
      fieldErrors: { incomeItemId: ["Choose an income row."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_finance_income_item", {
    p_income_item_id: parsedIncomeItemId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: financeIncomeErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateFinanceIncomePaths();

  return {
    message: "Income row voided.",
    status: "success",
  };
}

function financeIncomeErrorMessage(message: string) {
  if (message.includes("Accounting period is locked")) {
    return "This accounting period is locked. Unlock it before posting to ledger.";
  }

  if (message.includes("Record received money before posting")) {
    return "Record received money before posting this row to ledger.";
  }

  if (message.includes("Posted income stays in the ledger")) {
    return "Posted income already belongs to the ledger. Archive the ledger entry if you need to reverse it.";
  }

  return "We could not save the income row. Please check the fields and try again.";
}

function revalidateFinanceIncomePaths(
  propertyId?: string | null,
  unitId?: string | null,
) {
  revalidatePath("/overview");
  revalidatePath("/finance-dashboard");
  revalidatePath("/rent-income");
  revalidatePath("/ledger");
  revalidatePath("/reports");

  if (propertyId) {
    revalidatePath(`/properties/${propertyId}`);
  }

  if (unitId) {
    revalidatePath(`/units/${unitId}`);
  }
}
