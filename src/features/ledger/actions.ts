"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Constants } from "@/types/database";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";
import type { LedgerDirection } from "@/features/ledger/ledger.types";

type LedgerFieldErrors = {
  amount?: string[];
  category?: string[];
  currency?: string[];
  description?: string[];
  direction?: string[];
  entryId?: string[];
  propertyId?: string[];
  transactionDate?: string[];
  unitId?: string[];
};

export type LedgerActionState = {
  fieldErrors?: LedgerFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const createLedgerEntrySchema = z
  .object({
    amount: z.string().trim(),
    category: z
      .string()
      .trim()
      .min(2, "Enter a category.")
      .max(80, "Keep the category under 80 characters."),
    currency: z.enum(Constants.public.Enums.currency_code),
    description: z
      .string()
      .trim()
      .max(1200, "Keep the description under 1,200 characters."),
    direction: z.enum(["income", "expense"]),
    propertyId: z.uuid("Choose a property."),
    transactionDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a transaction date."),
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

    if (data.unitId.length > 0) {
      const parsedUnitId = z.uuid().safeParse(data.unitId);

      if (!parsedUnitId.success) {
        context.addIssue({
          code: "custom",
          message: "Choose a valid unit.",
          path: ["unitId"],
        });
      }
    }
  });

const ledgerEntryIdSchema = z.uuid("Choose a ledger entry.");

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): LedgerActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as LedgerFieldErrors,
    status: "error",
  };
}

export async function createLedgerEntryAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const context = await requireAdminContext();
  const parsed = createLedgerEntrySchema.safeParse({
    amount: readString(formData, "amount"),
    category: readString(formData, "category"),
    currency: readString(formData, "currency"),
    description: readString(formData, "description"),
    direction: readString(formData, "direction"),
    propertyId: readString(formData, "propertyId"),
    transactionDate: readString(formData, "transactionDate"),
    unitId: readString(formData, "unitId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const unitId = parsed.data.unitId.length > 0 ? parsed.data.unitId : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_ledger_entry", {
    p_amount: Number(parsed.data.amount),
    p_category: parsed.data.category,
    p_currency: parsed.data.currency as CurrencyCode,
    p_description: parsed.data.description,
    p_direction: parsed.data.direction as LedgerDirection,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_transaction_date: parsed.data.transactionDate,
    p_unit_id: unitId,
  });

  if (error) {
    return {
      message:
        "We could not add the ledger entry. Please check the fields and try again.",
      status: "error",
    };
  }

  revalidatePath("/ledger");
  revalidatePath("/timeline");
  revalidatePath("/properties");

  return {
    message: "Ledger entry added.",
    status: "success",
  };
}

export async function updateLedgerEntryAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const context = await requireAdminContext();
  const parsedEntryId = ledgerEntryIdSchema.safeParse(
    readString(formData, "entryId"),
  );
  const parsed = createLedgerEntrySchema.safeParse({
    amount: readString(formData, "amount"),
    category: readString(formData, "category"),
    currency: readString(formData, "currency"),
    description: readString(formData, "description"),
    direction: readString(formData, "direction"),
    propertyId: readString(formData, "propertyId"),
    transactionDate: readString(formData, "transactionDate"),
    unitId: readString(formData, "unitId"),
  });

  if (!parsedEntryId.success) {
    return {
      fieldErrors: { entryId: ["Choose a ledger entry."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const unitId = parsed.data.unitId.length > 0 ? parsed.data.unitId : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_ledger_entry", {
    p_amount: Number(parsed.data.amount),
    p_category: parsed.data.category,
    p_currency: parsed.data.currency as CurrencyCode,
    p_description: parsed.data.description,
    p_direction: parsed.data.direction as LedgerDirection,
    p_entry_id: parsedEntryId.data,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_transaction_date: parsed.data.transactionDate,
    p_unit_id: unitId,
  });

  if (error) {
    return {
      message:
        "We could not update the ledger entry. Please check the fields and try again.",
      status: "error",
    };
  }

  revalidatePath("/ledger");
  revalidatePath("/timeline");
  revalidatePath("/properties");

  return {
    message: "Ledger entry updated.",
    status: "success",
  };
}

export async function archiveLedgerEntryAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const context = await requireAdminContext();
  const parsedEntryId = ledgerEntryIdSchema.safeParse(
    readString(formData, "entryId"),
  );

  if (!parsedEntryId.success) {
    return {
      fieldErrors: { entryId: ["Choose a ledger entry."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_ledger_entry", {
    p_entry_id: parsedEntryId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: "We could not archive the ledger entry. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/ledger");
  revalidatePath("/timeline");
  revalidatePath("/properties");

  return {
    message: "Ledger entry archived.",
    status: "success",
  };
}
