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
  periodStart?: string[];
  propertyId?: string[];
  receipt?: string[];
  reason?: string[];
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
const periodLockSchema = z.object({
  lockState: z.enum(["locked", "unlocked"]),
  periodStart: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Choose an accounting month."),
  reason: z.string().trim().max(400, "Keep the reason under 400 characters."),
});

const receiptMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
      message: ledgerActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLedgerPaths();

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
      message: ledgerActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLedgerPaths();

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
      message: ledgerActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLedgerPaths();

  return {
    message: "Ledger entry archived.",
    status: "success",
  };
}

export async function restoreLedgerEntryAction(
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
  const { error } = await supabase.rpc("restore_ledger_entry", {
    p_entry_id: parsedEntryId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: ledgerActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLedgerPaths();

  return {
    message: "Ledger entry restored.",
    status: "success",
  };
}

export async function setLedgerPeriodLockAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const context = await requireAdminContext();
  const parsed = periodLockSchema.safeParse({
    lockState: readString(formData, "lockState"),
    periodStart: readString(formData, "periodStart"),
    reason: readString(formData, "reason"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_ledger_period_lock", {
    p_locked: parsed.data.lockState === "locked",
    p_organization_id: context.organizationId,
    p_period_start: `${parsed.data.periodStart}-01`,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      message: ledgerActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateLedgerPaths({ includeProperties: false, includeReports: false, includeUnits: false });

  return {
    message:
      parsed.data.lockState === "locked"
        ? "Accounting period locked."
        : "Accounting period unlocked.",
    status: "success",
  };
}

export async function attachLedgerReceiptAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const context = await requireAdminContext();
  const parsedEntryId = ledgerEntryIdSchema.safeParse(
    readString(formData, "entryId"),
  );
  const file = formData.get("receipt");

  if (!parsedEntryId.success) {
    return {
      fieldErrors: { entryId: ["Choose a ledger entry."] },
      status: "error",
    };
  }

  if (!(file instanceof File) || file.size === 0) {
    return {
      fieldErrors: { receipt: ["Choose a receipt file."] },
      status: "error",
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      fieldErrors: { receipt: ["Receipts must be 10 MB or smaller."] },
      status: "error",
    };
  }

  if (!receiptMimeTypes.has(file.type)) {
    return {
      fieldErrors: { receipt: ["Upload a PDF, JPG, PNG, or WebP receipt."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: entry, error: entryError } = await supabase
    .from("ledger_entries")
    .select("id, property_id, unit_id")
    .eq("id", parsedEntryId.data)
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .maybeSingle();

  if (entryError || !entry) {
    return {
      message: "We could not find that active ledger entry.",
      status: "error",
    };
  }

  const { data: timelineEvent } = await supabase
    .from("timeline_events")
    .select("id")
    .eq("ledger_entry_id", parsedEntryId.data)
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${context.organizationId}/ledger/${parsedEntryId.data}/${crypto.randomUUID()}-${safeFileName}`;
  const { error: uploadError } = await supabase.storage
    .from("nestory-documents")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      message: "We could not upload the receipt. Please try again.",
      status: "error",
    };
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      category: "Receipt",
      file_name: file.name,
      ledger_entry_id: parsedEntryId.data,
      mime_type: file.type,
      organization_id: context.organizationId,
      property_id: entry.property_id,
      size_bytes: file.size,
      storage_path: storagePath,
      timeline_event_id: timelineEvent?.id ?? null,
      unit_id: entry.unit_id,
      uploaded_by: context.userId,
    })
    .select("id")
    .single();

  if (documentError || !document) {
    await supabase.storage.from("nestory-documents").remove([storagePath]);

    return {
      message: "We could not save the receipt record. Please try again.",
      status: "error",
    };
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    action: "receipt_attached",
    actor_id: context.userId,
    entity_id: parsedEntryId.data,
    entity_type: "ledger_entry",
    new_values: {
      document_id: document.id,
      file_name: file.name,
      timeline_event_id: timelineEvent?.id ?? null,
    },
    organization_id: context.organizationId,
  });

  if (logError) {
    return {
      message: "Receipt attached, but the activity log could not be saved.",
      status: "error",
    };
  }

  revalidateLedgerPaths({ includeDocuments: true });

  return {
    message: "Receipt attached.",
    status: "success",
  };
}

function ledgerActionErrorMessage(message: string) {
  if (message.includes("Accounting period is locked")) {
    return "This accounting period is locked. Unlock the period before changing this record.";
  }

  return "We could not save the ledger entry. Please check the fields and try again.";
}

function revalidateLedgerPaths({
  includeDocuments = false,
  includeProperties = true,
  includeReports = true,
  includeUnits = true,
}: {
  includeDocuments?: boolean;
  includeProperties?: boolean;
  includeReports?: boolean;
  includeUnits?: boolean;
} = {}) {
  revalidatePath("/overview");
  revalidatePath("/ledger");
  revalidatePath("/timeline");

  if (includeDocuments) {
    revalidatePath("/documents");
  }

  if (includeProperties) {
    revalidatePath("/properties");
  }

  if (includeReports) {
    revalidatePath("/reports");
  }

  if (includeUnits) {
    revalidatePath("/units");
  }
}
