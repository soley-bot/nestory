"use server";

import { revalidatePath } from "next/cache";
import {
  historicalRentCorrectionErrorMessage,
  parseHistoricalRentCorrectionInput,
  parseHistoricalRentCorrectionPreviewInput,
} from "@/features/leases/historical-rent-correction-input";
import { requireHistoricalRentRecoveryContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

export type HistoricalRentCorrectionBlocker = {
  code: string;
  detail?: Record<string, unknown>;
};

export type HistoricalRentCorrectionPreview = {
  blockers: HistoricalRentCorrectionBlocker[];
  canApply: boolean;
  correctedDueDate: string;
  correctedDueDay: number;
  correctedRentAmount: number;
  immutableEvidence: Record<string, boolean>;
  invoiceId: string;
  invoiceNumber: string;
  managementFeeDelta: number;
  originalDueDate: string;
  originalDueDay: number;
  originalManagementFeeAmount: number;
  originalRentAmount: number;
  previewHash: string;
  projectedTenantCreditAmount: number;
  rentDelta: number;
  replacementManagementFeeAmount?: number;
};

export type HistoricalRentCorrectionActionState = {
  message?: string;
  preview?: HistoricalRentCorrectionPreview;
  status?: "error" | "preview" | "success";
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readCorrectionInput(formData: FormData) {
  return {
    correctedDueDay: readString(formData, "correctedDueDay"),
    correctedRentAmount: readString(formData, "correctedRentAmount"),
    idempotencyKey: readString(formData, "idempotencyKey"),
    invoiceId: readString(formData, "invoiceId"),
    reason: readString(formData, "reason"),
  };
}

export async function previewHistoricalRentCorrectionAction(
  _state: HistoricalRentCorrectionActionState,
  formData: FormData,
): Promise<HistoricalRentCorrectionActionState> {
  const parsed = parseHistoricalRentCorrectionPreviewInput(
    readCorrectionInput(formData),
  );
  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ??
        "Complete the correction details before previewing.",
      status: "error",
    };
  }

  const context = await requireHistoricalRentRecoveryContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "preview_historical_rent_correction",
    {
      p_corrected_due_day: parsed.data.correctedDueDay,
      p_corrected_rent_amount: parsed.data.correctedRentAmount,
      p_invoice_id: parsed.data.invoiceId,
      p_organization_id: context.organizationId,
    },
  );

  if (error) {
    return {
      message: historicalRentCorrectionErrorMessage(error),
      status: "error",
    };
  }
  if (!isHistoricalRentCorrectionPreview(data)) {
    return {
      message: "Nestory could not verify the correction preview.",
      status: "error",
    };
  }

  return {
    message: data.canApply
      ? "Review the append-only changes before applying."
      : "Resolve every blocker, then preview again.",
    preview: data,
    status: "preview",
  };
}

export async function applyHistoricalRentCorrectionAction(
  _state: HistoricalRentCorrectionActionState,
  formData: FormData,
): Promise<HistoricalRentCorrectionActionState> {
  const parsed = parseHistoricalRentCorrectionInput({
    ...readCorrectionInput(formData),
    previewHash: readString(formData, "previewHash"),
  });
  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ??
        "Preview this correction again before applying it.",
      status: "error",
    };
  }

  const context = await requireHistoricalRentRecoveryContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("correct_historical_rent", {
    p_corrected_due_day: parsed.data.correctedDueDay,
    p_corrected_rent_amount: parsed.data.correctedRentAmount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_invoice_id: parsed.data.invoiceId,
    p_organization_id: context.organizationId,
    p_preview_hash: parsed.data.previewHash,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      message: historicalRentCorrectionErrorMessage(error),
      status: "error",
    };
  }

  for (const path of [
    "/finance",
    "/ledger",
    "/leases",
    "/owner-balances",
    "/rent-income",
    "/reports",
    `/leases?query=${parsed.data.invoiceId}`,
  ]) {
    revalidatePath(path);
  }

  return {
    message: "Historical rent corrected. Issued evidence was retained.",
    status: "success",
  };
}

function isHistoricalRentCorrectionPreview(
  value: unknown,
): value is HistoricalRentCorrectionPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Record<string, unknown>;
  return (
    Array.isArray(preview.blockers) &&
    typeof preview.canApply === "boolean" &&
    typeof preview.correctedDueDate === "string" &&
    typeof preview.correctedRentAmount === "number" &&
    typeof preview.invoiceId === "string" &&
    typeof preview.invoiceNumber === "string" &&
    typeof preview.originalRentAmount === "number" &&
    typeof preview.previewHash === "string" &&
    typeof preview.projectedTenantCreditAmount === "number"
  );
}
