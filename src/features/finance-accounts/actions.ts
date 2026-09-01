"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type FinanceAccountFieldErrors = Partial<
  Record<
    | "accountClass"
    | "accountId"
    | "accountNumber"
    | "accountSubtype"
    | "description"
    | "displayName"
    | "parentAccountId"
    | "propertyId"
    | "replacementAccountId"
    | "useForLeaseCharges"
    | "useForLeaseCredits"
    | "useForLeaseDeposits",
    string[]
  >
>;

export type FinanceAccountActionState = {
  fieldErrors?: FinanceAccountFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const ASSET_SUBTYPES = [
  "bank",
  "cash",
  "petty_cash",
  "accounts_receivable",
  "other_current_asset",
  "fixed_asset",
  "other_asset",
] as const;
const LIABILITY_SUBTYPES = [
  "accounts_payable",
  "credit_card",
  "current_liability",
  "long_term_liability",
] as const;
const INCOME_SUBTYPES = ["income", "other_income"] as const;
const EXPENSE_SUBTYPES = ["expense", "other_expense", "cogs"] as const;
const PROPERTY_ACCOUNT_SUBTYPES = ["bank", "cash", "petty_cash"] as const;

const optionalText = (maximum: number, message: string) =>
  z.string().trim().max(maximum, message);
const optionalUuid = (message: string) =>
  z.string().trim().refine(
    (value) => value === "" || z.uuid().safeParse(value).success,
    message,
  );

const accountDetails = {
  accountNumber: optionalText(24, "Use at most 24 characters for the account number."),
  description: optionalText(1_000, "Use at most 1,000 characters for the description."),
  displayName: z
    .string()
    .trim()
    .min(2, "Enter an account name.")
    .max(100, "Use at most 100 characters for the account name."),
  parentAccountId: optionalUuid("Choose an account as the parent."),
  propertyId: optionalUuid("Choose an available property."),
  useForLeaseCharges: z.boolean(),
  useForLeaseCredits: z.boolean(),
  useForLeaseDeposits: z.boolean(),
};

const financeAccountSchema = z
  .discriminatedUnion("accountClass", [
    z.object({
      ...accountDetails,
      accountClass: z.literal("asset"),
      accountSubtype: z.enum(ASSET_SUBTYPES, "Choose a compatible account type."),
    }),
    z.object({
      ...accountDetails,
      accountClass: z.literal("liability"),
      accountSubtype: z.enum(LIABILITY_SUBTYPES, "Choose a compatible account type."),
    }),
    z.object({
      ...accountDetails,
      accountClass: z.literal("equity"),
      accountSubtype: z.literal("equity"),
    }),
    z.object({
      ...accountDetails,
      accountClass: z.literal("income"),
      accountSubtype: z.enum(INCOME_SUBTYPES, "Choose a compatible account type."),
    }),
    z.object({
      ...accountDetails,
      accountClass: z.literal("expense"),
      accountSubtype: z.enum(EXPENSE_SUBTYPES, "Choose a compatible account type."),
    }),
  ])
  .superRefine((value, context) => {
    if (value.useForLeaseCharges && value.accountClass !== "income") {
      context.addIssue({
        code: "custom",
        message: "Lease charges use an Income account.",
        path: ["useForLeaseCharges"],
      });
    }
    if (value.useForLeaseCredits && value.accountClass !== "expense") {
      context.addIssue({
        code: "custom",
        message: "Lease credits use an Expense account.",
        path: ["useForLeaseCredits"],
      });
    }
    if (
      value.useForLeaseDeposits &&
      !(value.accountClass === "liability" && value.accountSubtype === "current_liability")
    ) {
      context.addIssue({
        code: "custom",
        message: "Lease deposits use a Current liability account.",
        path: ["useForLeaseDeposits"],
      });
    }
    if (
      value.propertyId &&
      !(value.accountClass === "asset" && PROPERTY_ACCOUNT_SUBTYPES.includes(value.accountSubtype as (typeof PROPERTY_ACCOUNT_SUBTYPES)[number]))
    ) {
      context.addIssue({
        code: "custom",
        message: "Only Bank and Cash accounts can be available to one property.",
        path: ["propertyId"],
      });
    }
  });

const updateFinanceAccountSchema = financeAccountSchema.and(z.object({
  accountId: z.uuid("Choose an account."),
}));

const lifecycleSchema = z.object({
  accountId: z.uuid("Choose an account."),
  archived: z.enum(["true", "false"]).transform((value) => value === "true"),
  replacementAccountId: optionalUuid("Choose a replacement account."),
});

export async function createFinanceAccountAction(
  _state: FinanceAccountActionState,
  formData: FormData,
): Promise<FinanceAccountActionState> {
  const parsed = financeAccountSchema.safeParse(readAccountForm(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_finance_account", {
    p_account_class: parsed.data.accountClass,
    p_account_number: nullableRpcText(parsed.data.accountNumber),
    p_account_subtype: parsed.data.accountSubtype,
    p_description: nullableRpcText(parsed.data.description),
    p_display_name: parsed.data.displayName,
    p_organization_id: context.organizationId,
    p_parent_account_id: nullableRpcText(parsed.data.parentAccountId),
    p_property_id: nullableRpcText(parsed.data.propertyId),
    p_use_for_lease_charges: parsed.data.useForLeaseCharges,
    p_use_for_lease_credits: parsed.data.useForLeaseCredits,
    p_use_for_lease_deposits: parsed.data.useForLeaseDeposits,
  });
  if (error) return expectedDatabaseError(error);

  revalidateFinanceAccountPaths();
  return { message: "Account added.", status: "success" };
}

export async function updateFinanceAccountAction(
  _state: FinanceAccountActionState,
  formData: FormData,
): Promise<FinanceAccountActionState> {
  const parsed = updateFinanceAccountSchema.safeParse({
    ...readAccountForm(formData),
    accountId: readString(formData, "accountId"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_finance_account", {
    p_account_id: parsed.data.accountId,
    p_account_number: nullableRpcText(parsed.data.accountNumber),
    p_description: nullableRpcText(parsed.data.description),
    p_display_name: parsed.data.displayName,
    p_organization_id: context.organizationId,
    p_parent_account_id: nullableRpcText(parsed.data.parentAccountId),
    p_property_id: nullableRpcText(parsed.data.propertyId),
    p_use_for_lease_charges: parsed.data.useForLeaseCharges,
    p_use_for_lease_credits: parsed.data.useForLeaseCredits,
    p_use_for_lease_deposits: parsed.data.useForLeaseDeposits,
  });
  if (error) return expectedDatabaseError(error);

  revalidateFinanceAccountPaths();
  return { message: "Account updated.", status: "success" };
}

export async function setFinanceAccountArchivedAction(
  _state: FinanceAccountActionState,
  formData: FormData,
): Promise<FinanceAccountActionState> {
  const parsed = lifecycleSchema.safeParse({
    accountId: readString(formData, "accountId"),
    archived: readString(formData, "archived"),
    replacementAccountId: readString(formData, "replacementAccountId"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_finance_account_archived", {
    p_account_id: parsed.data.accountId,
    p_archived: parsed.data.archived,
    p_organization_id: context.organizationId,
    p_replacement_account_id: nullableRpcText(parsed.data.replacementAccountId),
  });
  if (error) return expectedDatabaseError(error);

  revalidateFinanceAccountPaths();
  return {
    message: parsed.data.archived ? "Account made inactive." : "Account made active.",
    status: "success",
  };
}

function readAccountForm(formData: FormData) {
  return {
    accountClass: readString(formData, "accountClass"),
    accountNumber: readString(formData, "accountNumber"),
    accountSubtype: readString(formData, "accountSubtype"),
    description: readString(formData, "description"),
    displayName: readString(formData, "displayName"),
    parentAccountId: readString(formData, "parentAccountId"),
    propertyId: readString(formData, "propertyId"),
    useForLeaseCharges: readCheckbox(formData, "useForLeaseCharges"),
    useForLeaseCredits: readCheckbox(formData, "useForLeaseCredits"),
    useForLeaseDeposits: readCheckbox(formData, "useForLeaseDeposits"),
  };
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readCheckbox(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value === "on" || value === "true";
}

function nullableRpcText(value: string) {
  return value || (null as never);
}

function validationError(error: z.ZodError): FinanceAccountActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as FinanceAccountFieldErrors,
    status: "error",
  };
}

function expectedDatabaseError(error: { code: string; message: string }): FinanceAccountActionState {
  if (error.code === "23505") {
    return {
      fieldErrors: { displayName: ["Use a unique account name."] },
      status: "error",
    };
  }
  const message = error.message.toLowerCase();
  if (error.code === "22023" && message.includes("parent")) {
    return {
      fieldErrors: { parentAccountId: ["Choose a parent with the same account type."] },
      status: "error",
    };
  }
  if (error.code === "22023" && message.includes("property")) {
    return {
      fieldErrors: { propertyId: ["Choose an available property for this account."] },
      status: "error",
    };
  }
  if (error.code === "22023" && message.includes("replacement")) {
    return {
      fieldErrors: { replacementAccountId: ["Choose an active replacement with the same account type."] },
      status: "error",
    };
  }
  if (error.code === "22023") {
    return {
      fieldErrors: { accountClass: ["Choose a compatible account type."] },
      status: "error",
    };
  }
  if (error.code === "55000" && message.includes("replacement")) {
    return {
      fieldErrors: { replacementAccountId: ["Choose a replacement default before making this account inactive."] },
      status: "error",
    };
  }
  if (error.code === "55000") {
    return {
      message: "This account cannot be changed while it is in use.",
      status: "error",
    };
  }
  throw error;
}

function revalidateFinanceAccountPaths() {
  for (const path of ["/finance/accounts", "/bills-expenses", "/rent-income"]) {
    revalidatePath(path);
  }
}
