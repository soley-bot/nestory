"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type BillsExpensesFieldErrors = {
  amount?: string[];
  category?: string[];
  companyLossAmount?: string[];
  description?: string[];
  dueDate?: string[];
  economicScope?: string[];
  expenseItemId?: string[];
  expenseType?: string[];
  invoiceDate?: string[];
  ownerBillStatus?: string[];
  ownerReimbursableAmount?: string[];
  ownerReimbursedAmount?: string[];
  paidDate?: string[];
  propertyId?: string[];
  reference?: string[];
  unitId?: string[];
  vendorLabel?: string[];
  vendorPersonId?: string[];
};

export type BillsExpensesActionState = {
  fieldErrors?: BillsExpensesFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const optionalUuidSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || z.uuid().safeParse(value).success, {
    message: "Choose a valid record.",
  });
const expenseItemIdSchema = z.uuid("Choose a bill or expense.");
const createExpenseSchema = z
  .object({
    amount: z.string().trim(),
    category: z
      .string()
      .trim()
      .min(2, "Enter a category.")
      .max(80, "Keep the category under 80 characters."),
    description: z.string().trim().max(1200, "Keep the note under 1,200 characters."),
    dueDate: z.string().trim(),
    economicScope: z.enum(["property_expense", "company_advance", "company_cost"]),
    expenseType: z.enum([
      "vendor_bill",
      "maintenance",
      "utilities",
      "supplies",
      "owner_payout",
      "refund",
      "other",
    ]),
    invoiceDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an invoice date."),
    ownerBillStatus: z.enum([
      "not_billable",
      "billable",
      "billed",
      "partially_reimbursed",
      "reimbursed",
      "written_off",
    ]),
    ownerReimbursableAmount: z.string().trim(),
    ownerReimbursedAmount: z.string().trim(),
    companyLossAmount: z.string().trim(),
    propertyId: z.uuid("Choose a property."),
    reference: z.string().trim().max(120, "Keep the reference under 120 characters."),
    unitId: optionalUuidSchema,
    vendorLabel: z
      .string()
      .trim()
      .min(2, "Enter a vendor or payee.")
      .max(120, "Keep the vendor under 120 characters."),
    vendorPersonId: optionalUuidSchema,
  })
  .superRefine((data, context) => {
    const amount = Number(data.amount);
    const ownerReimbursableAmount = Number(data.ownerReimbursableAmount || "0");
    const ownerReimbursedAmount = Number(data.ownerReimbursedAmount || "0");
    const companyLossAmount = Number(data.companyLossAmount || "0");

    if (!Number.isFinite(amount) || amount <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter an amount greater than zero.",
        path: ["amount"],
      });
    }

    if (!Number.isFinite(ownerReimbursableAmount) || ownerReimbursableAmount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid owner billable amount.",
        path: ["ownerReimbursableAmount"],
      });
    }

    if (!Number.isFinite(ownerReimbursedAmount) || ownerReimbursedAmount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid reimbursed amount.",
        path: ["ownerReimbursedAmount"],
      });
    }

    if (ownerReimbursedAmount > ownerReimbursableAmount) {
      context.addIssue({
        code: "custom",
        message: "Reimbursed cannot exceed billable.",
        path: ["ownerReimbursedAmount"],
      });
    }

    if (!Number.isFinite(companyLossAmount) || companyLossAmount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid company loss amount.",
        path: ["companyLossAmount"],
      });
    }

    if (Number.isFinite(amount) && companyLossAmount > amount) {
      context.addIssue({
        code: "custom",
        message: "Company loss cannot exceed the expense.",
        path: ["companyLossAmount"],
      });
    }

    if (
      data.economicScope === "company_advance" &&
      data.ownerBillStatus === "not_billable"
    ) {
      context.addIssue({
        code: "custom",
        message: "Company advances must be billable, billed, reimbursed, or written off.",
        path: ["ownerBillStatus"],
      });
    }

    if (
      data.economicScope === "company_advance" &&
      Number.isFinite(ownerReimbursableAmount) &&
      ownerReimbursableAmount <= 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter the amount to bill the owner.",
        path: ["ownerReimbursableAmount"],
      });
    }

    if (
      data.economicScope !== "company_advance" &&
      (ownerReimbursableAmount > 0 || ownerReimbursedAmount > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Owner reimbursement only applies to company advances.",
        path: ["ownerReimbursableAmount"],
      });
    }

    if (data.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) {
      context.addIssue({
        code: "custom",
        message: "Choose a due date.",
        path: ["dueDate"],
      });
    }
  });

const postExpenseSchema = z.object({
  expenseItemId: expenseItemIdSchema,
  paidDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a posting date."),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): BillsExpensesActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as BillsExpensesFieldErrors,
    status: "error",
  };
}

export async function createBillsExpenseItemAction(
  _state: BillsExpensesActionState,
  formData: FormData,
): Promise<BillsExpensesActionState> {
  const context = await requireAdminContext();
  const parsed = createExpenseSchema.safeParse({
    amount: readString(formData, "amount"),
    category: readString(formData, "category"),
    companyLossAmount: readString(formData, "companyLossAmount"),
    description: readString(formData, "description"),
    dueDate: readString(formData, "dueDate"),
    economicScope: readString(formData, "economicScope") || "property_expense",
    expenseType: readString(formData, "expenseType"),
    invoiceDate: readString(formData, "invoiceDate"),
    ownerBillStatus: readString(formData, "ownerBillStatus") || "not_billable",
    ownerReimbursableAmount: readString(formData, "ownerReimbursableAmount"),
    ownerReimbursedAmount: readString(formData, "ownerReimbursedAmount"),
    propertyId: readString(formData, "propertyId"),
    reference: readString(formData, "reference"),
    unitId: readString(formData, "unitId"),
    vendorLabel: readString(formData, "vendorLabel"),
    vendorPersonId: readString(formData, "vendorPersonId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_finance_expense_item", {
    p_amount: Number(parsed.data.amount),
    p_category: parsed.data.category,
    p_description: parsed.data.description || null,
    p_due_date: parsed.data.dueDate || null,
    p_economic_scope: parsed.data.economicScope,
    p_expense_type: parsed.data.expenseType,
    p_invoice_date: parsed.data.invoiceDate,
    p_organization_id: context.organizationId,
    p_owner_bill_status: parsed.data.ownerBillStatus,
    p_owner_reimbursable_amount: Number(parsed.data.ownerReimbursableAmount || "0"),
    p_owner_reimbursed_amount: Number(parsed.data.ownerReimbursedAmount || "0"),
    p_company_loss_amount: Number(parsed.data.companyLossAmount || "0"),
    p_property_id: parsed.data.propertyId,
    p_reference: parsed.data.reference || null,
    p_task_id: null,
    p_unit_id: parsed.data.unitId || null,
    p_vendor_label: parsed.data.vendorLabel,
    p_vendor_person_id: parsed.data.vendorPersonId || null,
  });

  if (error) {
    return {
      message: billsExpensesErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateBillsExpensesPaths(parsed.data.propertyId, parsed.data.unitId || null);

  return {
    message: "Bill or expense created.",
    status: "success",
  };
}

export async function approveBillsExpenseItemAction(
  _state: BillsExpensesActionState,
  formData: FormData,
): Promise<BillsExpensesActionState> {
  return setExpenseStatus(formData, "approved", "Bill approved.");
}

export async function markBillsExpensePaidAction(
  _state: BillsExpensesActionState,
  formData: FormData,
): Promise<BillsExpensesActionState> {
  return setExpenseStatus(formData, "paid", "Expense marked paid.");
}

export async function voidBillsExpenseItemAction(
  _state: BillsExpensesActionState,
  formData: FormData,
): Promise<BillsExpensesActionState> {
  return setExpenseStatus(formData, "void", "Bill or expense voided.");
}

export async function postBillsExpenseItemAction(
  _state: BillsExpensesActionState,
  formData: FormData,
): Promise<BillsExpensesActionState> {
  const context = await requireAdminContext();
  const parsed = postExpenseSchema.safeParse({
    expenseItemId: readString(formData, "expenseItemId"),
    paidDate: readString(formData, "paidDate"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("post_finance_expense_item", {
    p_expense_item_id: parsed.data.expenseItemId,
    p_organization_id: context.organizationId,
    p_paid_date: parsed.data.paidDate,
  });

  if (error) {
    return {
      message: billsExpensesErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateBillsExpensesPaths();

  return {
    message: "Expense posted to ledger.",
    status: "success",
  };
}

async function setExpenseStatus(
  formData: FormData,
  status: "approved" | "paid" | "void",
  successMessage: string,
): Promise<BillsExpensesActionState> {
  const context = await requireAdminContext();
  const parsedExpenseItemId = expenseItemIdSchema.safeParse(
    readString(formData, "expenseItemId"),
  );

  if (!parsedExpenseItemId.success) {
    return {
      fieldErrors: { expenseItemId: ["Choose a bill or expense."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_finance_expense_status", {
    p_expense_item_id: parsedExpenseItemId.data,
    p_organization_id: context.organizationId,
    p_status: status,
  });

  if (error) {
    return {
      message: billsExpensesErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateBillsExpensesPaths();

  return {
    message: successMessage,
    status: "success",
  };
}

function billsExpensesErrorMessage(message: string) {
  if (message.includes("Accounting period is locked")) {
    return "This accounting period is locked. Unlock it before posting to ledger.";
  }

  if (message.includes("Approve the expense before posting")) {
    return "Approve this bill or expense before posting it to ledger.";
  }

  if (message.includes("Post the expense before marking it paid")) {
    return "Post this expense to ledger before marking it paid.";
  }

  return "We could not save the bill or expense. Please check the fields and try again.";
}

function revalidateBillsExpensesPaths(
  propertyId?: string | null,
  unitId?: string | null,
) {
  revalidatePath("/overview");
  revalidatePath("/ledger");
  revalidatePath("/bills-expenses");
  revalidatePath("/ledger");
  revalidatePath("/reports");

  if (propertyId) {
    revalidatePath(`/properties/${propertyId}`);
  }

  if (unitId) {
    revalidatePath(`/units/${unitId}`);
  }
}
