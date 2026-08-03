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
  payerMode?: string[];
  payerPersonId?: string[];
  propertyId?: string[];
  reason?: string[];
  receiptId?: string[];
  receivedDate?: string[];
  reconciliationSourceId?: string[];
  reference?: string[];
  reversalDate?: string[];
  unitId?: string[];
};

export type RentIncomeActionState = {
  fieldErrors?: RentIncomeFieldErrors;
  incomeItemId?: string;
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
      "management_fee",
      "leasing_commission",
      "service_fee",
      "maintenance_markup",
      "other",
    ]),
    leaseId: optionalUuidSchema,
    payerLabel: z.string().trim().max(120, "Keep the payer under 120 characters."),
    payerMode: z.enum(["external", "linked"]),
    payerPersonId: optionalUuidSchema,
    propertyId: z.uuid("Choose a property."),
    receivedDate: z.string().trim(),
    reference: z.string().trim().max(120, "Keep the reference under 120 characters."),
    unitId: optionalUuidSchema,
  })
  .superRefine((data, context) => {
    const amountDue = Number(data.amountDue);
    const amountReceived = Number(data.amountReceived || "0");

    if (!Number.isFinite(amountDue) || amountDue <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter an expected amount greater than zero.",
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

    if (amountReceived > 0) {
      context.addIssue({
        code: "custom",
        message:
          "Create the obligation first, then record cash with the checked receipt action.",
        path: ["amountReceived"],
      });
    }

    if (data.payerMode === "linked" && !data.payerPersonId) {
      context.addIssue({
        code: "custom",
        message: "Choose an active Person record.",
        path: ["payerPersonId"],
      });
    }

    if (data.payerMode === "external" && data.payerLabel.length < 2) {
      context.addIssue({
        code: "custom",
        message: "Enter the external payer name.",
        path: ["payerLabel"],
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
    idempotencyKey: z.string().trim().min(8),
    incomeItemId: incomeItemIdSchema,
    receivedDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a received date."),
    reconciliationSourceId: z.uuid("Choose the account that received the cash."),
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
      return;
    }

    if (!/^(?:\d+|\d*\.\d{1,2})$/.test(data.amountReceived)) {
      context.addIssue({
        code: "custom",
        message: "Use at most two decimal places.",
        path: ["amountReceived"],
      });
    }
  });

const reverseReceiptSchema = z.object({
  idempotencyKey: z.string().trim().min(8),
  propertyId: optionalUuidSchema,
  reason: z
    .string()
    .trim()
    .min(3, "Explain why this receipt is being reversed.")
    .max(400, "Keep the reason under 400 characters."),
  receiptId: z.uuid("Choose a receipt."),
  reconciliationSourceId: z.uuid(
    "Choose the account for the reversing cash event.",
  ),
  reversalDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a reversal date."),
  unitId: optionalUuidSchema,
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
    payerMode: readString(formData, "payerMode"),
    payerPersonId: readString(formData, "payerPersonId"),
    propertyId: readString(formData, "propertyId"),
    receivedDate: readString(formData, "receivedDate"),
    reference: readString(formData, "reference"),
    unitId: readString(formData, "unitId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: incomeItemId, error } = await supabase.rpc("create_finance_income_item", {
    p_amount_due: Number(parsed.data.amountDue),
    p_amount_received: Number(parsed.data.amountReceived || "0"),
    p_description: parsed.data.description || null,
    p_due_date: parsed.data.dueDate,
    p_income_type: parsed.data.incomeType,
    p_lease_id: parsed.data.leaseId || null,
    p_organization_id: context.organizationId,
    p_payer_label:
      parsed.data.payerMode === "external" ? parsed.data.payerLabel : "",
    p_payer_person_id:
      parsed.data.payerMode === "linked" ? parsed.data.payerPersonId : null,
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
    incomeItemId: incomeItemId ?? undefined,
    message:
      "Income charge created. Record actual cash from the receipt action so the allocation, Ledger, and journal commit together.",
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
    idempotencyKey: readString(formData, "idempotencyKey"),
    incomeItemId: readString(formData, "incomeItemId"),
    receivedDate: readString(formData, "receivedDate"),
    reconciliationSourceId: readString(
      formData,
      "reconciliationSourceId",
    ),
    reference: readString(formData, "reference"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { data: incomeItem, error: incomeItemError } = await supabase
    .from("finance_income_items")
    .select("property_id, unit_id")
    .eq("organization_id", context.organizationId)
    .eq("id", parsed.data.incomeItemId)
    .is("archived_at", null)
    .maybeSingle();

  if (incomeItemError || !incomeItem) {
    return {
      message: "The income row is no longer available.",
      status: "error",
    };
  }

  const receiptAmount = Number(parsed.data.amountReceived);
  const { data: settlement, error } = await supabase.rpc(
    "record_finance_receipt_v2",
    {
      p_amount: receiptAmount,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_income_item_id: parsed.data.incomeItemId,
      p_organization_id: context.organizationId,
      p_reconciliation_source_id: parsed.data.reconciliationSourceId,
      p_received_date: parsed.data.receivedDate,
      p_reference: parsed.data.reference || "",
    },
  );

  if (error) {
    return {
      message: financeIncomeErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateFinanceIncomePaths(incomeItem.property_id, incomeItem.unit_id);

  const outstandingAfter =
    settlement &&
    typeof settlement === "object" &&
    !Array.isArray(settlement) &&
    "outstanding_balance_after" in settlement
      ? Number(settlement.outstanding_balance_after)
      : Number.NaN;

  return {
    message:
      Number.isFinite(outstandingAfter) && outstandingAfter <= 0
        ? "Receipt recorded and projected. The income balance is fully settled."
        : "Receipt recorded and projected. The remaining balance can still accept another receipt.",
    status: "success",
  };
}

export async function reverseRentIncomeReceiptAction(
  _state: RentIncomeActionState,
  formData: FormData,
): Promise<RentIncomeActionState> {
  const context = await requireAdminContext();
  const parsed = reverseReceiptSchema.safeParse({
    idempotencyKey: readString(formData, "idempotencyKey"),
    propertyId: readString(formData, "propertyId"),
    reason: readString(formData, "reason"),
    receiptId: readString(formData, "receiptId"),
    reconciliationSourceId: readString(
      formData,
      "reconciliationSourceId",
    ),
    reversalDate: readString(formData, "reversalDate"),
    unitId: readString(formData, "unitId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_finance_receipt_v2", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_reason: parsed.data.reason,
    p_receipt_id: parsed.data.receiptId,
    p_reconciliation_source_id: parsed.data.reconciliationSourceId,
    p_reversal_date: parsed.data.reversalDate,
  });

  if (error) {
    return {
      message: financeIncomeErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateFinanceIncomePaths(
    parsed.data.propertyId || null,
    parsed.data.unitId || null,
  );

  return {
    message: "Receipt reversed with linked Ledger and journal evidence.",
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
  if (
    message.includes("Accounting period is locked") ||
    message.includes("Income settlement period is not open")
  ) {
    return "This financial period is closed. Reopen it through the controlled close workflow before recording cash.";
  }

  if (message.includes("Reconciliation source is not active")) {
    return "Choose an active cash account for this property and currency.";
  }

  if (message.includes("Conflicting financial idempotency request")) {
    return "This submission key was already used with different receipt details. Refresh and try again.";
  }

  if (message.includes("Finance receipt is already reversed")) {
    return "This receipt has already been reversed.";
  }

  if (message.includes("allocation_publication_classification_required")) {
    return "This historical receipt needs classification evidence before it can be reversed.";
  }

  if (message.includes("income_settlement_class_not_supported")) {
    return "Use the dedicated custody or owner-funding workflow for this income class.";
  }

  if (message.includes("Payer person not found")) {
    return "Choose an active Person record from this workspace.";
  }

  if (message.includes("External payer name is required")) {
    return "Enter the external payer name.";
  }

  if (message.includes("Receipt allocation exceeds open balance")) {
    return "Receipt amount cannot exceed the remaining balance.";
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
  revalidatePath("/ledger");
  revalidatePath("/rent-income");
  revalidatePath("/reports");
  revalidatePath("/timeline");
  revalidatePath("/property-timeline");
  revalidatePath("/financial-timeline");

  if (propertyId) {
    revalidatePath(`/properties/${propertyId}`);
  }

  if (unitId) {
    revalidatePath(`/units/${unitId}`);
  }
}
