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
  description?: string[];
  entryId?: string[];
  entryKind?: string[];
  floatAmount?: string[];
  invoiceDate?: string[];
  name?: string[];
  periodId?: string[];
  propertyId?: string[];
  receiptReference?: string[];
  remark?: string[];
  status?: string[];
  supplier?: string[];
  unitId?: string[];
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
  floatAmount: z.string().trim(),
  name: z.string().trim().min(2, "Enter an account name."),
});

const createEntrySchema = z
  .object({
    accountId: looseUuidSchema,
    amount: z.string().trim(),
    category: z.string().trim().min(2, "Enter a category."),
    clearDate: z.string().trim(),
    description: z.string().trim().min(2, "Enter a description."),
    entryKind: z.enum(["advance", "cash_in", "expense"]),
    invoiceDate: dateSchema,
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

    if (data.entryKind === "expense" && data.propertyId.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose a property before recording an expense.",
        path: ["propertyId"],
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
  });

const entryIdSchema = looseUuidSchema;
const openNextPeriodSchema = z.object({
  accountId: looseUuidSchema,
  advanceAmount: z.string().trim(),
  periodId: looseUuidSchema,
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_petty_cash_account", {
    p_account_number: parsed.data.accountNumber,
    p_custodian_person_id: null,
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
  const parsed = createEntrySchema.safeParse({
    accountId: readString(formData, "accountId"),
    amount: readString(formData, "amount"),
    category: readString(formData, "category"),
    clearDate: readString(formData, "clearDate"),
    description: readString(formData, "description"),
    entryKind: readString(formData, "entryKind"),
    invoiceDate: readString(formData, "invoiceDate"),
    periodId: readString(formData, "periodId"),
    propertyId: readString(formData, "propertyId"),
    receiptReference: readString(formData, "receiptReference"),
    remark: readString(formData, "remark"),
    status: readString(formData, "status"),
    supplier: readString(formData, "supplier"),
    unitId: readString(formData, "unitId"),
  });

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
    p_description: parsed.data.description,
    p_entry_kind: parsed.data.entryKind,
    p_invoice_date: parsed.data.invoiceDate,
    p_organization_id: context.organizationId,
    p_period_id: parsed.data.periodId,
    p_property_id: propertyId,
    p_receipt_reference:
      parsed.data.receiptReference.length > 0
        ? parsed.data.receiptReference
        : null,
    p_remark: parsed.data.remark.length > 0 ? parsed.data.remark : null,
    p_status: parsed.data.status,
    p_supplier: parsed.data.supplier.length > 0 ? parsed.data.supplier : null,
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

  return "We could not save the petty cash record. Please check the fields and try again.";
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
