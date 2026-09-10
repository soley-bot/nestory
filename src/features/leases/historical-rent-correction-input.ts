import { z } from "zod";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const moneyPattern = /^\d+(?:\.\d{1,2})?$/;
const previewHashPattern = /^[0-9a-f]{64}$/;

const historicalRentCorrectionSchema = z.object({
  correctedManagementFeeAmount: z.string().trim()
    .regex(moneyPattern, "Enter a management fee with no more than two decimal places.")
    .transform(Number)
    .refine((value) => Number.isFinite(value) && value >= 0 && value < 1000000000000,
      "Enter a management fee from 0 to 999999999999.99.")
    .optional(),
  correctedDueDay: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a due day from 1 to 31.")
    .transform(Number)
    .refine(
      (value) => Number.isInteger(value) && value >= 1 && value <= 31,
      "Enter a due day from 1 to 31.",
    ),
  correctedRentAmount: z
    .string()
    .trim()
    .min(1, "Enter a rent amount greater than zero.")
    .refine((value) => moneyPattern.test(value), {
      message: "Use no more than two decimal places.",
    })
    .transform(Number)
    .refine(
      (value) => Number.isFinite(value) && value > 0,
      "Enter a rent amount greater than zero.",
    ),
  idempotencyKey: z.string().trim().min(8).max(160),
  invoiceId: postgresUuid("Choose a historical rent period."),
  previewHash: z
    .string()
    .trim()
    .regex(
      previewHashPattern,
      "Preview this correction again before applying it.",
    ),
  reason: z
    .string()
    .trim()
    .min(8, "Explain the correction in at least 8 characters.")
    .max(500, "Keep the reason under 500 characters."),
});

const historicalRentCorrectionPreviewSchema =
  historicalRentCorrectionSchema.omit({ previewHash: true });

export type HistoricalRentCorrectionInput = z.infer<
  typeof historicalRentCorrectionSchema
>;

export function parseHistoricalRentCorrectionInput(input: {
  correctedManagementFeeAmount?: string;
  correctedDueDay: string;
  correctedRentAmount: string;
  idempotencyKey: string;
  invoiceId: string;
  previewHash: string;
  reason: string;
}) {
  return historicalRentCorrectionSchema.safeParse(input);
}

export function parseHistoricalRentCorrectionPreviewInput(input: {
  correctedManagementFeeAmount?: string;
  correctedDueDay: string;
  correctedRentAmount: string;
  idempotencyKey: string;
  invoiceId: string;
  reason: string;
}) {
  return historicalRentCorrectionPreviewSchema.safeParse(input);
}

export function historicalRentCorrectionErrorMessage(error: {
  details?: string | null;
  message: string;
}) {
  const evidence = `${error.message} ${error.details ?? ""}`;

  if (evidence.includes("management_fee_correction_inputs_invalid")) {
    return "Enter a management fee with up to two decimal places and keep the issued rent and due day unchanged.";
  }
  if (evidence.includes("management_fee_correction_authority_required")) {
    return "Preview the management fee correction again before applying it.";
  }
  if (evidence.includes("management_fee_already_corrected")) {
    return "This issued period already has a management fee correction.";
  }
  if (evidence.includes("management_fee_no_change")) {
    return "Enter a management fee amount different from the current fee.";
  }

  if (evidence.includes("historical_rent_dependent_owner_cash") || evidence.includes("dependent_owner_cash:")) {
    return "Collected rent has already funded another owner charge or distribution. Reverse that dependent transaction through its correction workflow, then preview again.";
  }

  if (evidence.includes("historical_rent_owner_roster_changed")) {
    return "Owner shares have changed since collection. Resolve the ownership handoff before replaying this period; the original owner allocation must be preserved.";
  }

  if (evidence.includes("historical_rent_tenant_credit_unsupported")) {
    return "The corrected rent is below money already collected. Keep this period unchanged until tenant-credit accounting is available; no refund has been recorded.";
  }
  if (evidence.includes("historical_rent_payment_account_unavailable")) {
    return "An original payment account is retired or its history cannot be verified. Restore the original account or resolve its history, then preview again.";
  }
  if (evidence.includes("privileged_email_step_up_required")) {
    return "Complete the required email verification, then preview this correction again.";
  }

  if (evidence.includes("historical_rent_preview_stale")) {
    return "Preview changed after the page loaded. Preview this correction again.";
  }
  if (evidence.includes("financial_month_locked")) {
    return "Unlock the current financial month before replaying settlement evidence.";
  }
  if (
    evidence.includes("historical_rent_owner_close_reopen_required") ||
    evidence.includes("historical_rent_correction_blocked") &&
      evidence.includes("owner_close")
  ) {
    return "Reopen every affected Owner Close month, then preview the correction again. Prior statements stay unchanged.";
  }
  if (evidence.includes("owner_invoice_settlement_active")) {
    return "The management-fee owner charge is settled. Reverse that owner settlement before correcting this period.";
  }
  if (evidence.includes("historical_rent_owner_custody_changed")) {
    return "The direct-rent owner has changed. Resolve the custody handoff before correcting this period.";
  }
  if (evidence.includes("historical_rent_settlement_owner_effect_missing")) {
    return "This settlement's owner allocation evidence is incomplete, so Nestory cannot replay it safely.";
  }
  if (evidence.includes("historical_rent_already_corrected")) {
    return "This historical rent period already has a correction.";
  }
  if (evidence.includes("historical_rent_invoice_not_eligible")) {
    return "Choose an issued historical rent period generated from Lease billing rules.";
  }
  if (
    evidence.includes("historical_rent_correction_forbidden") ||
    evidence.includes("row-level security")
  ) {
    return "Only a Super Admin can correct historical rent.";
  }

  return "Nestory could not safely correct this historical rent period. Preview it again and review the blockers.";
}
