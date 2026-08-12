"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import { OWNER_BALANCE_COMPONENTS } from "@/features/owner-balances/owner-balance.types";
import {
  requireOwnerCloseContext,
  requireOwnerMonthReopenContext,
  requireOwnerStatementPublicationContext,
} from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";
import { buildOwnerStatementXlsx } from "@/features/reports/data/excel";
import { buildOwnerStatementPdf } from "@/features/reports/data/pdf";
import { loadOwnerStatementPublication } from "@/features/reports/data/owner-statement-report";

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

const publishSchema = z.object({
  idempotencyKey,
  revisionId: uuid,
});

const resumePublicationSchema = z.object({
  idempotencyKey,
  publicationId: uuid,
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

export async function publishOwnerStatementAction(formData: FormData): Promise<void> {
  const input = parse(publishSchema, formData);
  const context = await requireOwnerStatementPublicationContext();
  const supabase = await createSupabaseServerClient();
  const publication = await supabase.rpc("publish_owner_statement", {
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_close_revision_id: input.revisionId,
  });
  if (publication.error) {
    throw new Error(publication.error.message ?? "Owner Statement publication failed.");
  }

  await completeOwnerStatementPublication(
    supabase,
    context.organizationId,
    context.userId,
    input.idempotencyKey,
    publication.data,
  );
}

export async function resumeOwnerStatementPublicationAction(
  formData: FormData,
): Promise<void> {
  const input = parse(resumePublicationSchema, formData);
  const context = await requireOwnerStatementPublicationContext();
  const supabase = await createSupabaseServerClient();
  const publication = await supabase.rpc("resume_owner_statement_publication", {
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_publication_id: input.publicationId,
  });
  if (publication.error) {
    throw new Error(publication.error.message ?? "Owner Statement recovery failed.");
  }

  await completeOwnerStatementPublication(
    supabase,
    context.organizationId,
    context.userId,
    input.idempotencyKey,
    publication.data,
  );
}

async function completeOwnerStatementPublication(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  actorId: string,
  commandKey: string,
  publicationResult: unknown,
) {
  const publicationId = requiredRpcString(publicationResult, "publication_id");
  const statementNumber = requiredRpcString(publicationResult, "statement_number");
  const model = await loadOwnerStatementPublication(supabase, organizationId, publicationId);
  if (model.statementNumber !== statementNumber || model.publicationId !== publicationId) {
    throw new Error("Owner Statement publication identity changed during rendering.");
  }

  const artifacts = [
    {
      bytes: buildOwnerStatementPdf(model),
      contentType: "application/pdf",
      format: "pdf" as const,
    },
    {
      bytes: buildOwnerStatementXlsx(model),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      format: "xlsx" as const,
    },
  ];
  const bucket = supabase.storage.from("owner-statements");
  const admin = createSupabaseAdminClient();
  const adminBucket = admin.storage.from("owner-statements");
  const registeredFormats = new Set((model.artifacts ?? []).map((artifact) => artifact.format));

  for (const artifact of artifacts) {
    if (registeredFormats.has(artifact.format)) continue;
    const storagePath = ownerStatementStoragePath(
      organizationId,
      publicationId,
      statementNumber,
      artifact.format,
    );
    const expectedHash = sha256Hex(artifact.bytes);
    await uploadOrVerifyArtifact(
      bucket,
      storagePath,
      artifact.bytes,
      artifact.contentType,
      expectedHash,
    );

    const object = await admin.rpc("get_owner_statement_artifact_object", {
      p_actor_id: actorId,
      p_format: artifact.format,
      p_organization_id: organizationId,
      p_publication_id: publicationId,
      p_storage_path: storagePath,
    });
    if (object.error) {
      throw new Error(object.error.message ?? "Artifact object verification failed.");
    }
    const objectIdentity = requiredArtifactObject(object.data);
    const retained = await adminBucket.download(storagePath);
    if (retained.error || !retained.data) {
      throw new Error("Owner Statement retained bytes could not be verified.");
    }
    const retainedBytes = new Uint8Array(await retained.data.arrayBuffer());
    const retainedHash = sha256Hex(retainedBytes);
    if (
      retainedBytes.byteLength !== artifact.bytes.byteLength ||
      retainedHash !== expectedHash ||
      objectIdentity.metadataSizeBytes !== retainedBytes.byteLength ||
      objectIdentity.contentType !== artifact.contentType
    ) {
      throw new Error("Owner Statement retained bytes do not match the frozen renderer.");
    }

    const registration = await admin.rpc("register_owner_statement_artifact_verified", {
      p_actor_id: actorId,
      p_content_type: objectIdentity.contentType,
      p_format: artifact.format,
      p_idempotency_key: artifactReplayKey(commandKey, publicationId, artifact.format),
      p_organization_id: organizationId,
      p_publication_id: publicationId,
      p_sha256: retainedHash,
      p_size_bytes: retainedBytes.byteLength,
      p_storage_object_id: objectIdentity.storageObjectId,
      p_storage_object_version: objectIdentity.storageObjectVersion,
      p_storage_path: storagePath,
    });
    if (registration.error) {
      throw new Error(
        registration.error.message ?? `Owner Statement ${artifact.format} registration failed.`,
      );
    }
  }

  finish(null);
}

function ownerStatementStoragePath(
  organizationId: string,
  publicationId: string,
  statementNumber: string,
  format: "pdf" | "xlsx",
) {
  return `${organizationId}/${publicationId}/${format}/owner-statement-${statementNumber}.${format}`;
}

function artifactReplayKey(
  key: string,
  publicationId: string,
  format: "pdf" | "xlsx",
) {
  const digest = sha256Hex(
    new TextEncoder().encode(`owner-statement-artifact-v2\0${key}\0${publicationId}\0${format}`),
  );
  return `owner-statement-artifact-v2:${digest}`;
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function uploadOrVerifyArtifact(
  bucket: {
    download(path: string): PromiseLike<{
      data: Blob | null;
      error: { message?: string; statusCode?: string } | null;
    }>;
    upload(
      path: string,
      bytes: Uint8Array,
      options: { contentType: string; upsert: false },
    ): PromiseLike<{ error: { message?: string; statusCode?: string } | null }>;
  },
  path: string,
  bytes: Uint8Array,
  contentType: string,
  expectedHash: string,
) {
  const upload = await bucket.upload(path, bytes, { contentType, upsert: false });
  if (!upload.error) return;
  if (!isExistingObjectError(upload.error)) {
    throw new Error("Owner Statement artifact upload failed.");
  }

  const existing = await bucket.download(path);
  if (existing.error || !existing.data) {
    throw new Error("Existing Owner Statement artifact could not be verified.");
  }
  const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
  if (existingBytes.byteLength !== bytes.byteLength || sha256Hex(existingBytes) !== expectedHash) {
    throw new Error("Existing Owner Statement artifact bytes do not match this publication.");
  }
}

function requiredArtifactObject(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Owner Statement artifact object returned an invalid response.");
  }
  const row = value as Record<string, unknown>;
  const storageObjectId = requiredRpcString(row, "storage_object_id");
  const storageObjectVersion = requiredRpcString(row, "storage_object_version");
  const contentType = requiredRpcString(row, "content_type");
  const metadataSizeBytes = row.metadata_size_bytes;
  if (typeof metadataSizeBytes !== "number" || !Number.isSafeInteger(metadataSizeBytes)) {
    throw new Error("Owner Statement artifact object returned an invalid response.");
  }
  return { contentType, metadataSizeBytes, storageObjectId, storageObjectVersion };
}

function isExistingObjectError(error: { message?: string; statusCode?: string }) {
  return error.statusCode === "409" || /already exists|duplicate/i.test(error.message ?? "");
}

function requiredRpcString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    throw new Error("Owner Statement publication returned an invalid response.");
  }
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error("Owner Statement publication returned an invalid response.");
  }
  return candidate;
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
