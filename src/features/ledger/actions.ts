"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sha256Hex } from "@/features/documents/content-fingerprint";
import { removeUnregisteredDocumentObject } from "@/features/documents/storage-cleanup";
import {
  requireFinancialMonthLockContext,
  requireFinancialMonthUnlockContext,
  requirePermission,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type LedgerFieldErrors = {
  amount?: string[];
  category?: string[];
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

const ledgerEntryIdSchema = z.uuid("Choose a ledger entry.");
const periodLockSchema = z.object({
  lockState: z.enum(["locked", "unlocked"]),
  periodStart: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Choose a month."),
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

export async function setLedgerPeriodLockAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const parsed = periodLockSchema.safeParse({
    lockState: readString(formData, "lockState"),
    periodStart: readString(formData, "periodStart"),
    reason: readString(formData, "reason"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const context = parsed.data.lockState === "locked"
    ? await requireFinancialMonthLockContext()
    : await requireFinancialMonthUnlockContext();

  if (
    parsed.data.lockState === "locked" &&
    !context.isSuperAdmin &&
    parsed.data.reason.length === 0
  ) {
    return {
      fieldErrors: { reason: ["Enter an operational lock reason."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_financial_month_lock", {
    p_locked: parsed.data.lockState === "locked",
    p_month_start: `${parsed.data.periodStart}-01`,
    p_organization_id: context.organizationId,
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
        ? "Month locked."
        : "Month unlocked.",
    status: "success",
  };
}

export async function attachLedgerReceiptAction(
  _state: LedgerActionState,
  formData: FormData,
): Promise<LedgerActionState> {
  const context = await requirePermission("finance.correct_records");
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

  const { data: property } = await supabase
    .from("properties")
    .select("branch_id")
    .eq("organization_id", context.organizationId)
    .eq("id", entry.property_id)
    .is("archived_at", null)
    .maybeSingle();

  if (
    !property?.branch_id ||
    (!context.isSuperAdmin && context.branchId !== property.branch_id)
  ) {
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
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const contentSha256 = await sha256Hex(await file.arrayBuffer());
  const storagePath = `${context.organizationId}/branches/${property.branch_id}/ledger/${parsedEntryId.data}/${crypto.randomUUID()}-${safeFileName}`;
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

  const { data: documentId, error: documentError } = await supabase.rpc(
    "create_document",
    {
      p_activity_action: "receipt_attached",
      p_activity_entity_id: parsedEntryId.data,
      p_activity_entity_type: "ledger_entry",
      p_activity_new_values: {
        file_name: file.name,
        timeline_event_id: timelineEvent?.id ?? null,
      },
      p_category: "Receipt",
      p_content_sha256: contentSha256,
      p_file_name: file.name,
      p_ledger_entry_id: parsedEntryId.data,
      p_mime_type: file.type,
      p_organization_id: context.organizationId,
      p_property_id: entry.property_id,
      p_size_bytes: file.size,
      p_storage_path: storagePath,
      p_timeline_event_id: timelineEvent?.id ?? null,
      p_unit_id: entry.unit_id,
    },
  );

  if (documentError || !documentId) {
    await removeUnregisteredDocumentObject(supabase, storagePath);

    return {
      message: "We could not save the receipt record. Please try again.",
      status: "error",
    };
  }

  revalidateLedgerPaths({
    includeDocuments: true,
    propertyIds: [entry.property_id],
    unitIds: [entry.unit_id],
  });

  return {
    message: "Receipt attached.",
    status: "success",
  };
}

function ledgerActionErrorMessage(message: string) {
  if (message.includes("Financial month is locked")) {
    return "This month is locked. Unlock it before changing this record.";
  }

  return "We could not save the ledger entry. Please check the fields and try again.";
}

function revalidateLedgerPaths({
  includeDocuments = false,
  includeProperties = true,
  includeReports = true,
  includeUnits = true,
  propertyIds = [],
  unitIds = [],
}: {
  includeDocuments?: boolean;
  includeProperties?: boolean;
  includeReports?: boolean;
  includeUnits?: boolean;
  propertyIds?: Array<string | null | undefined>;
  unitIds?: Array<string | null | undefined>;
} = {}) {
  revalidatePath("/overview");
  revalidatePath("/ledger");
  revalidatePath("/leases");
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

  for (const propertyId of new Set(propertyIds.filter(Boolean))) {
    revalidatePath(`/properties/${propertyId}`);
  }

  for (const unitId of new Set(unitIds.filter(Boolean))) {
    revalidatePath(`/units/${unitId}`);
  }
}
