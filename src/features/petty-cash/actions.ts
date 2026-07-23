"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import { requireAdminContext } from "@/lib/auth/context";

type PettyCashFieldErrors = {
  accountNumber?: string[];
  advanceAmount?: string[];
  amount?: string[];
  category?: string[];
  clearDate?: string[];
  companyLossAmount?: string[];
  counterpartyMode?: string[];
  counterpartyPersonId?: string[];
  custodianPersonId?: string[];
  description?: string[];
  economicScope?: string[];
  entryId?: string[];
  entryKind?: string[];
  floatAmount?: string[];
  invoiceDate?: string[];
  name?: string[];
  periodId?: string[];
  ownerBillStatus?: string[];
  ownerReimbursableAmount?: string[];
  ownerReimbursedAmount?: string[];
  propertyId?: string[];
  receiptReference?: string[];
  remark?: string[];
  status?: string[];
  supplier?: string[];
  unitId?: string[];
  voidReason?: string[];
};

export type PettyCashActionState = {
  fieldErrors?: PettyCashFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const looseUuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Choose a valid record.",
  );

const createAccountSchema = z.object({
  accountNumber: z.string().trim().min(2, "Enter an account number."),
  custodianPersonId: z.string().trim(),
  floatAmount: z.string().trim(),
  name: z.string().trim().min(2, "Enter an account name."),
});

const createEntrySchema = z
  .object({
    accountId: looseUuidSchema,
    amount: z.string().trim(),
    category: z.string().trim().min(2, "Enter a category."),
    clearDate: z.string().trim(),
    companyLossAmount: z.string().trim(),
    counterpartyMode: z.enum(["external", "linked"]),
    counterpartyPersonId: z.string().trim(),
    description: z.string().trim().min(2, "Enter a description."),
    economicScope: z.enum(["company_advance", "company_cost", "property_expense"]),
    entryKind: z.enum(["advance", "cash_in", "expense"]),
    invoiceDate: dateSchema,
    ownerBillStatus: z.enum([
      "billable",
      "billed",
      "not_billable",
      "partially_reimbursed",
      "reimbursed",
      "written_off",
    ]),
    ownerReimbursableAmount: z.string().trim(),
    ownerReimbursedAmount: z.string().trim(),
    periodId: looseUuidSchema,
    propertyId: z.string().trim(),
    receiptReference: z.string().trim().max(120, "Keep receipt reference short."),
    remark: z.string().trim().max(400, "Keep remarks under 400 characters."),
    status: z.enum(["draft", "cleared"]),
    supplier: z.string().trim().max(120, "Keep supplier under 120 characters."),
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    const amount = Number(data.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter an amount greater than zero.",
        path: ["amount"],
      });
    }

    const ownerReimbursableAmount = Number(data.ownerReimbursableAmount || "0");
    const ownerReimbursedAmount = Number(data.ownerReimbursedAmount || "0");
    const companyLossAmount = Number(data.companyLossAmount || "0");

    for (const [field, value] of [
      ["ownerReimbursableAmount", ownerReimbursableAmount],
      ["ownerReimbursedAmount", ownerReimbursedAmount],
      ["companyLossAmount", companyLossAmount],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        context.addIssue({
          code: "custom",
          message: "Enter a zero or positive amount.",
          path: [field],
        });
      }
    }

    if (
      Number.isFinite(ownerReimbursedAmount) &&
      Number.isFinite(ownerReimbursableAmount) &&
      ownerReimbursedAmount > ownerReimbursableAmount
    ) {
      context.addIssue({
        code: "custom",
        message: "Reimbursed cannot exceed billable amount.",
        path: ["ownerReimbursedAmount"],
      });
    }

    if (
      Number.isFinite(companyLossAmount) &&
      Number.isFinite(amount) &&
      companyLossAmount > amount
    ) {
      context.addIssue({
        code: "custom",
        message: "Company loss cannot exceed the cash amount.",
        path: ["companyLossAmount"],
      });
    }

    if (data.entryKind === "expense" && data.propertyId.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose a property before recording an expense.",
        path: ["propertyId"],
      });
    }

    if (
      data.entryKind === "expense" &&
      data.economicScope === "company_advance" &&
      data.ownerBillStatus === "not_billable"
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose how the owner will be billed.",
        path: ["ownerBillStatus"],
      });
    }

    if (
      data.propertyId.length > 0 &&
      !looseUuidSchema.safeParse(data.propertyId).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid property.",
        path: ["propertyId"],
      });
    }

    if (
      data.unitId.length > 0 &&
      !looseUuidSchema.safeParse(data.unitId).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid unit.",
        path: ["unitId"],
      });
    }

    if (data.clearDate.length > 0 && !dateSchema.safeParse(data.clearDate).success) {
      context.addIssue({
        code: "custom",
        message: "Enter a clear date.",
        path: ["clearDate"],
      });
    }

    if (
      data.counterpartyMode === "linked" &&
      !looseUuidSchema.safeParse(data.counterpartyPersonId).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a linked person.",
        path: ["counterpartyPersonId"],
      });
    }

    if (data.counterpartyMode === "external" && data.supplier.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Enter the external party name.",
        path: ["supplier"],
      });
    }
  });

const entryIdSchema = looseUuidSchema;
const voidEntrySchema = z.object({
  entryId: looseUuidSchema,
  voidReason: z
    .string()
    .trim()
    .min(2, "Explain why this row is being voided.")
    .max(400, "Keep the void reason under 400 characters."),
});
const openNextPeriodSchema = z.object({
  accountId: looseUuidSchema,
  advanceAmount: z.string().trim(),
  periodId: looseUuidSchema,
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseEntryFormData(formData: FormData) {
  return createEntrySchema.safeParse({
    accountId: readString(formData, "accountId"),
    amount: readString(formData, "amount"),
    category: readString(formData, "category"),
    clearDate: readString(formData, "clearDate"),
    companyLossAmount: readString(formData, "companyLossAmount"),
    counterpartyMode:
      readString(formData, "counterpartyMode") ||
      (readString(formData, "counterpartyPersonId") ? "linked" : "external"),
    counterpartyPersonId: readString(formData, "counterpartyPersonId"),
    description: readString(formData, "description"),
    economicScope:
      readString(formData, "economicScope") || "property_expense",
    entryKind: readString(formData, "entryKind"),
    invoiceDate: readString(formData, "invoiceDate"),
    ownerBillStatus:
      readString(formData, "ownerBillStatus") || "not_billable",
    ownerReimbursableAmount: readString(formData, "ownerReimbursableAmount"),
    ownerReimbursedAmount: readString(formData, "ownerReimbursedAmount"),
    periodId: readString(formData, "periodId"),
    propertyId: readString(formData, "propertyId"),
    receiptReference: readString(formData, "receiptReference"),
    remark: readString(formData, "remark"),
    status: readString(formData, "status"),
    supplier: readString(formData, "supplier"),
    unitId: readString(formData, "unitId"),
  });
}

function invalidFormState(error: z.ZodError): PettyCashActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as PettyCashFieldErrors,
    status: "error",
  };
}

export async function createPettyCashAccountAction(
  _state: PettyCashActionState,
  formData: FormData,
): Promise<PettyCashActionState> {
  const context = await requireAdminContext();
  const parsed = createAccountSchema.safeParse({
    accountNumber: readString(formData, "accountNumber"),
    custodianPersonId: readString(formData, "custodianPersonId"),
    floatAmount: readString(formData, "floatAmount"),
    name: readString(formData, "name"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const floatAmount = Number(parsed.data.floatAmount || "0");

  if (!Number.isFinite(floatAmount) || floatAmount < 0) {
    return {
      fieldErrors: { floatAmount: ["Enter a zero or positive float amount."] },
      status: "error",
    };
  }

  if (
    parsed.data.custodianPersonId.length > 0 &&
    !looseUuidSchema.safeParse(parsed.data.custodianPersonId).success
  ) {
    return {
      fieldErrors: { custodianPersonId: ["Choose a valid Staff custodian."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_petty_cash_account", {
    p_account_number: parsed.data.accountNumber,
    p_custodian_person_id: parsed.data.custodianPersonId || null,
    p_float_amount: floatAmount,
    p_name: parsed.data.name,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: pettyCashErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePettyCashPaths();

  return {
    message: "Petty cash account created.",
    status: "success",
  };
}

export async function createPettyCashEntryAction(
  _state: PettyCashActionState,
  formData: FormData,
): Promise<PettyCashActionState> {
  const context = await requireAdminContext();
  const parsed = parseEntryFormData(formData);

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const propertyId =
    parsed.data.propertyId.length > 0 ? parsed.data.propertyId : null;
  const unitId = parsed.data.unitId.length > 0 ? parsed.data.unitId : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_petty_cash_entry", {
    p_account_id: parsed.data.accountId,
    p_amount: Number(parsed.data.amount),
    p_category: parsed.data.category,
    p_clear_date:
      parsed.data.clearDate.length > 0 ? parsed.data.clearDate : null,
    p_company_loss_amount: Number(parsed.data.companyLossAmount || "0"),
    p_counterparty_person_id:
      parsed.data.counterpartyMode === "linked"
        ? parsed.data.counterpartyPersonId
        : null,
    p_description: parsed.data.description,
    p_economic_scope: parsed.data.economicScope,
    p_entry_kind: parsed.data.entryKind,
    p_invoice_date: parsed.data.invoiceDate,
    p_organization_id: context.organizationId,
    p_owner_bill_status: parsed.data.ownerBillStatus,
    p_owner_reimbursable_amount: Number(
      parsed.data.ownerReimbursableAmount || "0",
    ),
    p_owner_reimbursed_amount: Number(parsed.data.ownerReimbursedAmount || "0"),
    p_period_id: parsed.data.periodId,
    p_property_id: propertyId,
    p_receipt_reference:
      parsed.data.receiptReference.length > 0
        ? parsed.data.receiptReference
        : null,
    p_remark: parsed.data.remark.length > 0 ? parsed.data.remark : null,
    p_status: parsed.data.status,
    p_supplier:
      parsed.data.counterpartyMode === "external" ? parsed.data.supplier : null,
    p_unit_id: unitId,
  });

  if (error) {
    return {
      message: pettyCashErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePettyCashPaths({
    propertyIds: [propertyId],
    unitIds: [unitId],
  });

  return {
    message: "Petty cash row added.",
    status: "success",
  };
}

export async function updatePettyCashEntryAction(
  _state: PettyCashActionState,
  formData: FormData,
): Promise<PettyCashActionState> {
  const context = await requireAdminContext();
  const parsedEntryId = entryIdSchema.safeParse(readString(formData, "entryId"));
  const parsed = parseEntryFormData(formData);

  if (!parsedEntryId.success) {
    return {
      fieldErrors: { entryId: ["Choose a petty cash row."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const propertyId =
    parsed.data.propertyId.length > 0 ? parsed.data.propertyId : null;
  const unitId = parsed.data.unitId.length > 0 ? parsed.data.unitId : null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_petty_cash_entry", {
    p_amount: Number(parsed.data.amount),
    p_category: parsed.data.category,
    p_clear_date:
      parsed.data.clearDate.length > 0 ? parsed.data.clearDate : null,
    p_company_loss_amount: Number(parsed.data.companyLossAmount || "0"),
    p_counterparty_person_id:
      parsed.data.counterpartyMode === "linked"
        ? parsed.data.counterpartyPersonId
        : null,
    p_description: parsed.data.description,
    p_economic_scope: parsed.data.economicScope,
    p_entry_id: parsedEntryId.data,
    p_entry_kind: parsed.data.entryKind,
    p_invoice_date: parsed.data.invoiceDate,
    p_organization_id: context.organizationId,
    p_owner_bill_status: parsed.data.ownerBillStatus,
    p_owner_reimbursable_amount: Number(
      parsed.data.ownerReimbursableAmount || "0",
    ),
    p_owner_reimbursed_amount: Number(
      parsed.data.ownerReimbursedAmount || "0",
    ),
    p_property_id: propertyId,
    p_receipt_reference:
      parsed.data.receiptReference.length > 0
        ? parsed.data.receiptReference
        : null,
    p_remark: parsed.data.remark.length > 0 ? parsed.data.remark : null,
    p_status: parsed.data.status,
    p_supplier:
      parsed.data.counterpartyMode === "external" ? parsed.data.supplier : null,
    p_unit_id: unitId,
  });

  if (error) {
    return {
      message: pettyCashErrorMessage(error.message),
      status: "error",
    };
  }

  const contexts = readEntryContextResult(data);
  revalidatePettyCashPaths({
    propertyIds: [
      contexts?.previousPropertyId,
      contexts?.propertyId,
      propertyId,
    ],
    unitIds: [contexts?.previousUnitId, contexts?.unitId, unitId],
  });

  return {
    message: "Petty cash row updated.",
    status: "success",
  };
}

export async function voidPettyCashEntryAction(
  _state: PettyCashActionState,
  formData: FormData,
): Promise<PettyCashActionState> {
  const context = await requireAdminContext();
  const parsed = voidEntrySchema.safeParse({
    entryId: readString(formData, "entryId"),
    voidReason: readString(formData, "voidReason"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_petty_cash_entry", {
    p_entry_id: parsed.data.entryId,
    p_organization_id: context.organizationId,
    p_reason: parsed.data.voidReason,
  });

  if (error) {
    return {
      message: pettyCashErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePettyCashPaths();

  return {
    message: "Petty cash row voided. Its original amount remains visible.",
    status: "success",
  };
}

export async function openNextPettyCashPeriodAction(
  _state: PettyCashActionState,
  formData: FormData,
): Promise<PettyCashActionState> {
  const context = await requireAdminContext();
  const parsed = openNextPeriodSchema.safeParse({
    accountId: readString(formData, "accountId"),
    advanceAmount: readString(formData, "advanceAmount"),
    periodId: readString(formData, "periodId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const advanceAmount =
    parsed.data.advanceAmount.length > 0
      ? Number(parsed.data.advanceAmount)
      : null;

  if (advanceAmount !== null && (!Number.isFinite(advanceAmount) || advanceAmount < 0)) {
    return {
      fieldErrors: { advanceAmount: ["Enter a zero or positive amount."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("open_next_petty_cash_period", {
    p_account_id: parsed.data.accountId,
    p_advance_amount: advanceAmount,
    p_organization_id: context.organizationId,
    p_period_id: parsed.data.periodId,
  });

  if (error) {
    return {
      message: pettyCashErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePettyCashPaths();

  return {
    message: "Next petty cash month opened.",
    status: "success",
  };
}

export async function postPettyCashEntryAction(
  _state: PettyCashActionState,
  formData: FormData,
): Promise<PettyCashActionState> {
  const context = await requireAdminContext();
  const parsedEntryId = entryIdSchema.safeParse(readString(formData, "entryId"));

  if (!parsedEntryId.success) {
    return {
      fieldErrors: { entryId: ["Choose a petty cash row."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_petty_cash_entry", {
    p_entry_id: parsedEntryId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: pettyCashErrorMessage(error.message),
      status: "error",
    };
  }

  revalidatePettyCashPaths();

  return {
    message: "Petty cash expense posted to ledger.",
    status: "success",
  };
}

function pettyCashErrorMessage(message: string) {
  if (message.includes("duplicate key")) {
    return "That petty cash account already exists.";
  }

  if (message.includes("Accounting period is locked")) {
    return "The ledger period is locked. Unlock the period before posting.";
  }

  if (message.includes("Only petty cash expenses")) {
    return "Only cash-out expense rows post to the ledger.";
  }

  if (message.includes("Post or void petty cash expenses")) {
    return "Post or void cash expense rows before opening the next month.";
  }

  if (message.includes("Petty cash period is already closed")) {
    return "This petty cash month is already closed.";
  }

  if (
    message.includes("Only unposted draft or cleared petty cash rows can be edited")
  ) {
    return "Only unposted draft or cleared rows can be edited.";
  }

  if (
    message.includes("Only unposted draft or cleared petty cash rows can be voided")
  ) {
    return "Only unposted draft or cleared rows can be voided.";
  }

  if (message.includes("Counterparty must be an active person")) {
    return "Choose an active person from this workspace.";
  }

  if (message.includes("Custodian must be active Staff")) {
    return "Choose an active Staff custodian from this workspace.";
  }

  if (message.includes("Open petty cash period not found")) {
    return "This petty cash month is closed and cannot be changed.";
  }

  return "We could not save the petty cash record. Please check the fields and try again.";
}

function readEntryContextResult(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const value = data as Record<string, unknown>;
  const optionalString = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : undefined;

  return {
    previousPropertyId: optionalString("previous_property_id"),
    previousUnitId: optionalString("previous_unit_id"),
    propertyId: optionalString("property_id"),
    unitId: optionalString("unit_id"),
  };
}

function revalidatePettyCashPaths({
  propertyIds = [],
  unitIds = [],
}: {
  propertyIds?: Array<string | null | undefined>;
  unitIds?: Array<string | null | undefined>;
} = {}) {
  revalidatePath("/petty-cash");
  revalidatePath("/ledger");
  revalidatePath("/overview");
  revalidatePath("/reports");
  revalidatePath("/timeline");
  revalidatePath("/properties");
  revalidatePath("/units");

  for (const propertyId of new Set(propertyIds.filter(Boolean))) {
    revalidatePath(`/properties/${propertyId}`);
  }

  for (const unitId of new Set(unitIds.filter(Boolean))) {
    revalidatePath(`/units/${unitId}`);
  }
}
