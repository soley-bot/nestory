"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import { OWNER_BALANCE_COMPONENTS } from "@/features/owner-balances/owner-balance.types";
import {
  requireOwnerCloseContext,
  requireOwnerMonthReopenContext,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

const uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Choose a valid record.",
);
const firstOfMonth = z.string().regex(
  /^\d{4}-(?:0[1-9]|1[0-2])-01$/,
  "Choose the first day of a month.",
);
const date = z.string().regex(
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/,
  "Choose a valid date.",
);
const reason = z.string().trim().min(3).max(500);
const idempotencyKey = z.string().trim().min(8).max(160);
const evidenceHash = z.string().regex(
  /^[0-9a-f]{64}$/,
  "Use a lowercase SHA-256 evidence fingerprint.",
);

const closeSchema = z.object({
  closeReason: reason,
  currency: z.literal("USD"),
  idempotencyKey,
  monthStart: firstOfMonth,
  ownerPersonId: uuid,
  propertyId: uuid,
});

const reopenSchema = z.object({
  idempotencyKey,
  reopenReason: reason,
  seriesId: uuid,
});

const correctionSchema = z.object({
  component: z.enum(OWNER_BALANCE_COMPONENTS),
  effectiveDate: date,
  evidenceSha256: evidenceHash,
  idempotencyKey,
  reason,
  revisionId: uuid,
  signedAmount: z.string(),
  sourceReference: z.string().trim().min(3).max(240),
});

export async function closeOwnerMonthAction(formData: FormData): Promise<void> {
  const input = parse(closeSchema, formData);
  const context = await requireOwnerCloseContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("close_owner_month", {
    p_close_reason: input.closeReason,
    p_currency: input.currency,
    p_idempotency_key: input.idempotencyKey,
    p_month_start: input.monthStart,
    p_organization_id: context.organizationId,
    p_owner_person_id: input.ownerPersonId,
    p_property_id: input.propertyId,
  });
  finish(result.error);
}

export async function reopenOwnerMonthAction(formData: FormData): Promise<void> {
  const input = parse(reopenSchema, formData);
  const context = await requireOwnerMonthReopenContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("reopen_owner_month", {
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_close_series_id: input.seriesId,
    p_reopen_reason: input.reopenReason,
  });
  finish(result.error);
}

export async function recordOwnerCloseCorrectionAction(
  formData: FormData,
): Promise<void> {
  const input = parse(correctionSchema, formData);
  const signedAmount = canonicalizeSignedOwnerOpeningAmount(input.signedAmount);
  if (signedAmount === "0.00") throw new Error("Enter a nonzero correction amount.");

  const context = await requireOwnerMonthReopenContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("record_owner_close_correction", {
    p_component: input.component,
    p_effective_date: input.effectiveDate,
    p_evidence_sha256: input.evidenceSha256,
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_close_revision_id: input.revisionId,
    p_reason: input.reason,
    p_signed_amount: signedAmount,
    p_source_reference: input.sourceReference,
  });
  finish(result.error);
}

function parse<Schema extends z.ZodType>(
  schema: Schema,
  formData: FormData,
): z.output<Schema> {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid owner close command.");
  }
  return result.data;
}

function finish(error: { message?: string } | null) {
  if (error) throw new Error(error.message ?? "Authoritative owner close command failed.");
  revalidatePath("/balances");
}
