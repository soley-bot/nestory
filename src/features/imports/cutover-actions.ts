"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CutoverActionState } from "@/features/imports/action-states";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/types/database";

const uuidSchema = z.uuid();
const stageSchema = z.object({
  authorityStartDate: z.iso.date(),
  dataOwner: z.string().trim().min(3).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
  manifest: z.record(z.string(), z.unknown()),
});
const commitSchema = z.object({
  batchId: uuidSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  signoffReason: z.string().trim().min(8).max(1000),
});
const stageResultSchema = z.object({
  batch_id: uuidSchema,
  manifest_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["staged", "blocked"]),
});
const commitResultSchema = z.object({
  batch_id: uuidSchema,
  reconciliation_id: uuidSchema.optional(),
  status: z.enum(["reconciled", "blocked"]),
});

type CutoverRpcClient = {
  rpc: (
    name: string,
    args: Record<string, Json | undefined>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function stageIpsCutoverBatchAction(
  _state: CutoverActionState,
  formData: FormData,
): Promise<CutoverActionState> {
  const manifest = readManifest(formData.get("manifest"));
  if (!manifest) {
    return { message: "Upload a valid IPS cutover manifest.", status: "error" };
  }
  const parsed = stageSchema.safeParse({
    authorityStartDate: formData.get("authorityStartDate"),
    dataOwner: formData.get("dataOwner"),
    idempotencyKey: formData.get("idempotencyKey"),
    manifest,
  });
  if (!parsed.success) {
    return { message: "Complete the cutover authority and manifest fields.", status: "error" };
  }
  const context = await requireSuperAdminContext();
  const supabase = (await createSupabaseServerClient()) as unknown as CutoverRpcClient;
  const result = await supabase.rpc("stage_ips_cutover_batch", {
    p_authority_start_date: parsed.data.authorityStartDate,
    p_data_owner: parsed.data.dataOwner,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_manifest: parsed.data.manifest as Json,
    p_organization_id: context.organizationId,
  });
  if (result.error) {
    return { message: cutoverErrorMessage(result.error.message), status: "error" };
  }
  const staged = stageResultSchema.safeParse(result.data);
  if (!staged.success) {
    return { message: "Could not read the staged cutover result.", status: "error" };
  }
  revalidatePath("/import");
  return {
    batchId: staged.data.batch_id,
    manifestSha256: staged.data.manifest_sha256,
    message:
      staged.data.status === "blocked"
        ? "Cutover manifest staged with blockers. Correct the source and stage a new manifest."
        : "Cutover manifest staged and ready for reconciliation.",
    status: "success",
  };
}

export async function commitIpsCutoverBatchAction(
  _state: CutoverActionState,
  formData: FormData,
): Promise<CutoverActionState> {
  const parsed = commitSchema.safeParse({
    batchId: formData.get("batchId"),
    idempotencyKey: formData.get("idempotencyKey"),
    signoffReason: formData.get("signoffReason"),
  });
  if (!parsed.success) {
    return { message: "Select a staged batch and record the reconciliation sign-off.", status: "error" };
  }
  const context = await requireSuperAdminContext();
  const supabase = (await createSupabaseServerClient()) as unknown as CutoverRpcClient;
  const result = await supabase.rpc("commit_ips_cutover_batch", {
    p_batch_id: parsed.data.batchId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_signoff_reason: parsed.data.signoffReason,
  });
  if (result.error) {
    return { batchId: parsed.data.batchId, message: cutoverErrorMessage(result.error.message), status: "error" };
  }
  const committed = commitResultSchema.safeParse(result.data);
  if (!committed.success) {
    return { batchId: parsed.data.batchId, message: "Could not read the cutover reconciliation result.", status: "error" };
  }
  revalidatePath("/import");
  return {
    batchId: committed.data.batch_id,
    message:
      committed.data.status === "blocked"
        ? "Cutover reconciliation is blocked. Review the exact differences and stage a corrected manifest."
        : "Cutover reconciled and frozen.",
    reconciliationId: committed.data.reconciliation_id,
    status: "success",
  };
}

function readManifest(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cutoverErrorMessage(message: string) {
  if (message.includes("cutover_not_authorized")) return "Only a Super Admin can manage cutover authority.";
  if (message.includes("cutover_batch_not_ready")) return "Resolve every cutover blocker before reconciliation.";
  if (message.includes("Conflicting financial idempotency")) return "This cutover request key was already used for different inputs.";
  return "The cutover authority could not be updated.";
}
