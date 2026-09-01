import { z } from "zod";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const moneyPattern = /^\d+(?:\.\d{1,2})?$/;
const previewHashPattern = /^[0-9a-f]{64}$/;

const historicalRentCorrectionSchema = z.object({
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
    return "The management-fee owner charge is settled. Reverse that owner settlement before correcting rent.";
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
