"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sha256Hex } from "@/features/documents/content-fingerprint";
import { removeUnregisteredDocumentObject } from "@/features/documents/storage-cleanup";
import {
  requireOwnerOpeningBalanceCorrectionContext,
  requireOwnerOpeningBalanceReviewContext,
  requireOwnerOpeningBalanceSubmissionContext,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

import { canonicalizeOwnerOpeningAmount } from "./owner-balance.money";
import {
  OWNER_BALANCE_COMPONENTS,
  type OwnerBalanceActionErrorCode,
  type OwnerBalanceActionState,
} from "./owner-balance.types";

const uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Choose a valid record.",
);
const firstOfMonth = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])-01$/, "Choose the first day of a month.");
const evidenceHash = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Use the verified lowercase document fingerprint.");
const idempotencyKey = z.string().trim().min(8).max(160);
const reason = z.string().trim().min(3).max(500);
const optionalUuid = z.preprocess(emptyToNull, uuid.nullable());
const optionalReference = z.preprocess(
  emptyToNull,
  z.string().trim().min(3).max(240).nullable(),
);
const optionalEvidenceFile = z.custom<File>(
  (value) => typeof File !== "undefined" && value instanceof File && value.size > 0,
  "Choose a valid evidence file.",
).optional();
const documentMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
type OwnerOpeningSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type PreparedDocument = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedThisAttempt: boolean;
};

const uniqueEntryIds = z.array(uuid).superRefine((entryIds, context) => {
  if (new Set(entryIds).size !== entryIds.length) {
    context.addIssue({ code: "custom", message: "Entry identifiers must be unique." });
  }
});
const initialSubmitResultSchema = z
  .object({
    entry_ids: uniqueEntryIds.length(0).optional(),
    request_id: uuid,
    request_kind: z.literal("initial").optional(),
    resubmission_of_request_id: uuid.nullable(),
    status: z.literal("submitted"),
  })
  .strict();
const correctionSubmitResultSchema = z
  .object({
    correction_of_entry_id: uuid,
    entry_ids: uniqueEntryIds.length(0).optional(),
    request_id: uuid,
    request_kind: z.literal("correction").optional(),
    resubmission_of_request_id: uuid.nullable(),
    status: z.literal("submitted"),
  })
  .strict();
const reviewResultSchema = z
  .object({
    decision: z.enum(["approve", "reject"]).optional(),
    entry_ids: uniqueEntryIds,
    request_id: uuid,
    request_kind: z.enum(["initial", "correction"]).optional(),
    status: z.enum(["approved", "rejected"]),
  })
  .strict();

const initialSchema = z
  .object({
    amount: z.string(),
    component: z.enum(OWNER_BALANCE_COMPONENTS),
    currency: z.literal("USD"),
    effectiveDate: firstOfMonth,
    evidenceSha256: evidenceHash,
    evidenceFile: optionalEvidenceFile,
    idempotencyKey,
    ownerPersonId: uuid,
    propertyId: uuid,
    reason,
    resubmissionOfRequestId: optionalUuid,
    sourceReference: optionalReference,
    supportingDocumentId: optionalUuid,
  })
  .refine(
    (value) =>
      value.sourceReference !== null ||
      value.supportingDocumentId !== null ||
      value.evidenceFile !== undefined,
    { message: "Attach verified evidence or enter its source reference." },
  );

const correctionSchema = z
  .object({
    entryId: uuid,
    evidenceSha256: evidenceHash,
    evidenceFile: optionalEvidenceFile,
    idempotencyKey,
    reason,
    replacementAmount: z.string(),
    resubmissionOfRequestId: optionalUuid,
    sourceReference: optionalReference,
    supportingDocumentId: optionalUuid,
  })
  .refine(
    (value) =>
      value.sourceReference !== null ||
      value.supportingDocumentId !== null ||
      value.evidenceFile !== undefined,
    { message: "Attach verified evidence or enter its source reference." },
  );

const reviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    idempotencyKey,
    requestId: uuid,
    reviewReason: z.preprocess(
      emptyToNull,
      z.string().trim().min(3).max(500).nullable(),
    ),
  })
  .refine((value) => value.decision !== "reject" || value.reviewReason !== null, {
    message: "Enter a reason when rejecting an opening balance.",
  });

export async function submitOwnerOpeningBalanceAction(
  _state: OwnerBalanceActionState | Record<string, never>,
  formData: FormData,
): Promise<OwnerBalanceActionState> {
  const parsed = initialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const amount = parseExactAmount(parsed.data.amount);
  if (typeof amount !== "string") return amount;

  let cleanupTarget:
    | { document: PreparedDocument; supabase: OwnerOpeningSupabase }
    | undefined;
  try {
    const context = await requireOwnerOpeningBalanceSubmissionContext();
    const supabase = await createSupabaseServerClient();
    const prepared = await prepareAtomicEvidence({
      evidenceFile: parsed.data.evidenceFile,
      evidenceSha256: parsed.data.evidenceSha256,
      idempotencyKey: parsed.data.idempotencyKey,
      operation: "initial",
      organizationId: context.organizationId,
      supabase,
      supportingDocumentId: parsed.data.supportingDocumentId,
      userId: context.userId,
    });
    if (prepared.state) return prepared.state;
    if (prepared.document) cleanupTarget = { document: prepared.document, supabase };

    const command = prepared.document
      ? await supabase.rpc("submit_owner_opening_balance_with_document", {
          p_amount: amount,
          p_component: parsed.data.component,
          p_currency: parsed.data.currency,
          p_document_file_name: prepared.document.fileName,
          p_document_mime_type: prepared.document.mimeType,
          p_document_size_bytes: prepared.document.sizeBytes,
          p_document_storage_path: prepared.document.storagePath,
          p_effective_date: parsed.data.effectiveDate,
          p_evidence_sha256: parsed.data.evidenceSha256,
          p_idempotency_key: parsed.data.idempotencyKey,
          p_organization_id: context.organizationId,
          p_owner_person_id: parsed.data.ownerPersonId,
          p_property_id: parsed.data.propertyId,
          p_reason: parsed.data.reason,
          p_resubmission_of_request_id: parsed.data.resubmissionOfRequestId,
          p_source_reference: parsed.data.sourceReference,
        })
      : await supabase.rpc("submit_owner_opening_balance", {
          p_amount: amount,
          p_component: parsed.data.component,
          p_currency: parsed.data.currency,
          p_effective_date: parsed.data.effectiveDate,
          p_evidence_sha256: parsed.data.evidenceSha256,
          p_idempotency_key: parsed.data.idempotencyKey,
          p_organization_id: context.organizationId,
          p_owner_person_id: parsed.data.ownerPersonId,
          p_property_id: parsed.data.propertyId,
          p_reason: parsed.data.reason,
          p_resubmission_of_request_id: parsed.data.resubmissionOfRequestId,
          p_source_reference: parsed.data.sourceReference,
          p_supporting_document_id: parsed.data.supportingDocumentId,
        });
    if (command.error) {
      await cleanupPreparedEvidence(supabase, prepared.document);
      return databaseError(command.error);
    }

    const result = parseInitialSubmitResult(
      command.data,
      parsed.data.resubmissionOfRequestId,
    );
    if (!result) {
      await cleanupPreparedEvidence(supabase, prepared.document);
      return unexpectedResponse();
    }
    revalidatePath("/balances");
    cleanupTarget = undefined;
    return {
      entryIds: result.entryIds,
      message: "Opening balance submitted for review.",
      requestId: result.requestId,
      status: "success",
    };
  } catch (error) {
    if (cleanupTarget) {
      await cleanupPreparedEvidence(cleanupTarget.supabase, cleanupTarget.document);
    }
    return databaseError(error);
  }
}

export async function submitOwnerOpeningBalanceCorrectionAction(
  _state: OwnerBalanceActionState | Record<string, never>,
  formData: FormData,
): Promise<OwnerBalanceActionState> {
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const replacementAmount = parseExactAmount(parsed.data.replacementAmount);
  if (typeof replacementAmount !== "string") return replacementAmount;

  let cleanupTarget:
    | { document: PreparedDocument; supabase: OwnerOpeningSupabase }
    | undefined;
  try {
    const context = await requireOwnerOpeningBalanceCorrectionContext();
    const supabase = await createSupabaseServerClient();
    const prepared = await prepareAtomicEvidence({
      evidenceFile: parsed.data.evidenceFile,
      evidenceSha256: parsed.data.evidenceSha256,
      idempotencyKey: parsed.data.idempotencyKey,
      operation: "correction",
      organizationId: context.organizationId,
      supabase,
      supportingDocumentId: parsed.data.supportingDocumentId,
      userId: context.userId,
    });
    if (prepared.state) return prepared.state;
    if (prepared.document) cleanupTarget = { document: prepared.document, supabase };

    const command = prepared.document
      ? await supabase.rpc(
          "submit_owner_opening_balance_correction_with_document",
          {
            p_document_file_name: prepared.document.fileName,
            p_document_mime_type: prepared.document.mimeType,
            p_document_size_bytes: prepared.document.sizeBytes,
            p_document_storage_path: prepared.document.storagePath,
            p_entry_id: parsed.data.entryId,
            p_evidence_sha256: parsed.data.evidenceSha256,
            p_idempotency_key: parsed.data.idempotencyKey,
            p_organization_id: context.organizationId,
            p_reason: parsed.data.reason,
            p_replacement_amount: replacementAmount,
            p_resubmission_of_request_id: parsed.data.resubmissionOfRequestId,
            p_source_reference: parsed.data.sourceReference,
          },
        )
      : await supabase.rpc(
          "submit_owner_opening_balance_correction",
          {
            p_entry_id: parsed.data.entryId,
            p_evidence_sha256: parsed.data.evidenceSha256,
            p_idempotency_key: parsed.data.idempotencyKey,
            p_organization_id: context.organizationId,
            p_reason: parsed.data.reason,
            p_replacement_amount: replacementAmount,
            p_resubmission_of_request_id: parsed.data.resubmissionOfRequestId,
            p_source_reference: parsed.data.sourceReference,
            p_supporting_document_id: parsed.data.supportingDocumentId,
          },
        );
    if (command.error) {
      await cleanupPreparedEvidence(supabase, prepared.document);
      return databaseError(command.error);
    }

    const result = parseCorrectionSubmitResult(command.data, {
      correctionOfEntryId: parsed.data.entryId,
      resubmissionOfRequestId: parsed.data.resubmissionOfRequestId,
    });
    if (!result) {
      await cleanupPreparedEvidence(supabase, prepared.document);
      return unexpectedResponse();
    }
    revalidatePath("/balances");
    cleanupTarget = undefined;
    return {
      entryIds: result.entryIds,
      message: "Opening-balance correction submitted for review.",
      requestId: result.requestId,
      status: "success",
    };
  } catch (error) {
    if (cleanupTarget) {
      await cleanupPreparedEvidence(cleanupTarget.supabase, cleanupTarget.document);
    }
    return databaseError(error);
  }
}

export async function reviewOwnerOpeningBalanceAction(
  _state: OwnerBalanceActionState | Record<string, never>,
  formData: FormData,
): Promise<OwnerBalanceActionState> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const context = await requireOwnerOpeningBalanceReviewContext();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("review_owner_opening_balance", {
      p_decision: parsed.data.decision,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_organization_id: context.organizationId,
      p_request_id: parsed.data.requestId,
      p_review_reason: parsed.data.reviewReason,
    });
    if (error) return databaseError(error);

    const result = parseReviewResult(data, {
      decision: parsed.data.decision,
      requestId: parsed.data.requestId,
    });
    if (!result) return unexpectedResponse();
    if (parsed.data.decision === "approve") {
      const requestResult = await supabase
        .from("owner_opening_balance_requests")
        .select("request_kind")
        .eq("organization_id", context.organizationId)
        .eq("id", parsed.data.requestId)
        .single();
      if (requestResult.error) return databaseError(requestResult.error);
      const requestKind = requestResult.data?.request_kind;
      if (requestKind !== "initial" && requestKind !== "correction") {
        return unexpectedResponse();
      }
      if (result.requestKind && result.requestKind !== requestKind) {
        return unexpectedResponse();
      }
      const expectedEntryCount = requestKind === "initial" ? 1 : 2;
      if (result.entryIds.length !== expectedEntryCount) return unexpectedResponse();
    }
    revalidatePath("/balances");
    return {
      entryIds: result.entryIds,
      message:
        parsed.data.decision === "approve"
          ? "Opening balance approved."
          : "Opening balance rejected.",
      requestId: result.requestId,
      status: "success",
    };
  } catch (error) {
    return databaseError(error);
  }
}

async function prepareAtomicEvidence({
  evidenceFile,
  evidenceSha256,
  idempotencyKey,
  operation,
  organizationId,
  supabase,
  supportingDocumentId,
  userId,
}: {
  evidenceFile?: File;
  evidenceSha256: string;
  idempotencyKey: string;
  operation: "initial" | "correction";
  organizationId: string;
  supabase: OwnerOpeningSupabase;
  supportingDocumentId: string | null;
  userId: string;
}): Promise<{
  document: PreparedDocument | null;
  state: OwnerBalanceActionState | null;
}> {
  if (!evidenceFile) return { document: null, state: null };
  if (supportingDocumentId) {
    return {
      document: null,
      state: evidenceError("Choose either registered evidence or a new file."),
    };
  }

  const fileError = validateEvidenceFile(evidenceFile);
  if (fileError) return { document: null, state: evidenceError(fileError) };

  const exactHash = await sha256Hex(await evidenceFile.arrayBuffer());
  if (exactHash !== evidenceSha256) {
    return {
      document: null,
      state: evidenceError("The evidence file no longer matches its fingerprint."),
    };
  }

  const documentId = await deterministicEvidenceDocumentId(
    organizationId,
    userId,
    operation,
    idempotencyKey,
  );
  const storagePath = `${organizationId}/owner-opening/${documentId}`;
  const bucket = supabase.storage.from("nestory-documents");
  const upload = await bucket.upload(storagePath, evidenceFile, {
    contentType: evidenceFile.type,
    upsert: false,
  });

  let uploadedThisAttempt = !upload.error;
  if (upload.error) {
    if (!isExistingObjectError(upload.error)) {
      return {
        document: null,
        state: evidenceError("The evidence file could not be uploaded. Try again."),
      };
    }

    const existing = await bucket.download(storagePath);
    if (existing.error || !existing.data) {
      return {
        document: null,
        state: evidenceError("The existing evidence object could not be verified."),
      };
    }
    const existingHash = await sha256Hex(await existing.data.arrayBuffer());
    if (
      existingHash !== evidenceSha256 ||
      existing.data.size !== evidenceFile.size ||
      existing.data.type !== evidenceFile.type
    ) {
      return {
        document: null,
        state: evidenceError(
          "This replay key already has different evidence bytes or metadata.",
        ),
      };
    }
    const metadata = await supabase
      .from("documents")
      .select(
        "id,organization_id,file_name,storage_path,mime_type,size_bytes,content_sha256,uploaded_by,archived_at",
      )
      .eq("organization_id", organizationId)
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (metadata.error) {
      return {
        document: null,
        state: evidenceError("The existing evidence metadata could not be verified."),
      };
    }
    if (
      metadata.data &&
      (
        metadata.data.id !== documentId ||
        metadata.data.organization_id !== organizationId ||
        metadata.data.file_name !== evidenceFile.name ||
        metadata.data.storage_path !== storagePath ||
        metadata.data.mime_type !== evidenceFile.type ||
        metadata.data.size_bytes !== evidenceFile.size ||
        metadata.data.content_sha256 !== evidenceSha256 ||
        metadata.data.uploaded_by !== userId ||
        metadata.data.archived_at !== null
      )
    ) {
      return {
        document: null,
        state: evidenceError("This replay key already has different evidence metadata."),
      };
    }
    uploadedThisAttempt = false;
  }

  return {
    document: {
      fileName: evidenceFile.name,
      mimeType: evidenceFile.type,
      sizeBytes: evidenceFile.size,
      storagePath,
      uploadedThisAttempt,
    },
    state: null,
  };
}

async function cleanupPreparedEvidence(
  supabase: OwnerOpeningSupabase,
  document: PreparedDocument | null,
) {
  if (!document?.uploadedThisAttempt) return;
  await removeUnregisteredDocumentObject(supabase, document.storagePath);
}

function validateEvidenceFile(file: File) {
  if (!file.name.trim() || file.name.length > 255) {
    return "Use an evidence file name under 256 characters.";
  }
  if (file.size > 10 * 1024 * 1024) {
    return "Evidence files must be 10 MB or smaller.";
  }
  if (!documentMimeTypes.has(file.type)) {
    return "Upload a PDF, JPG, PNG, or WebP evidence file.";
  }
  return "";
}

async function deterministicEvidenceDocumentId(
  organizationId: string,
  userId: string,
  operation: "initial" | "correction",
  idempotencyKey: string,
) {
  const digest = await sha256Hex(
    new TextEncoder().encode(
      `owner-opening-document-v1|${organizationId}|${userId}|${operation}|${idempotencyKey}`,
    ),
  );
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function isExistingObjectError(error: unknown) {
  const details = errorDetails(error);
  const statusCode =
    error && typeof error === "object"
      ? String((error as { statusCode?: unknown }).statusCode ?? "")
      : "";
  return (
    statusCode === "409" ||
    /already exists|duplicate|conflict/i.test(details.message)
  );
}

function evidenceError(message: string): OwnerBalanceActionState {
  return { errorCode: "evidence", message, status: "error" };
}

function emptyToNull(value: unknown) {
  return value === "" || value === undefined ? null : value;
}

function parseExactAmount(value: string): string | OwnerBalanceActionState {
  try {
    return canonicalizeOwnerOpeningAmount(value);
  } catch (error) {
    return {
      errorCode: "validation",
      message: error instanceof Error ? error.message : "Enter a valid amount.",
      status: "error",
    };
  }
}

function validationError(error: z.ZodError): OwnerBalanceActionState {
  return {
    errorCode: "validation",
    message: error.issues[0]?.message ?? "Check the opening balance details.",
    status: "error",
  };
}

function parseInitialSubmitResult(
  data: unknown,
  expectedPredecessorId: string | null,
): {
  requestId: string;
  entryIds: string[];
} | null {
  const parsed = initialSubmitResultSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.resubmission_of_request_id !== expectedPredecessorId
  ) {
    return null;
  }
  return { entryIds: parsed.data.entry_ids ?? [], requestId: parsed.data.request_id };
}

function parseCorrectionSubmitResult(
  data: unknown,
  expected: {
    correctionOfEntryId: string;
    resubmissionOfRequestId: string | null;
  },
): { requestId: string; entryIds: string[] } | null {
  const parsed = correctionSubmitResultSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.correction_of_entry_id !== expected.correctionOfEntryId ||
    parsed.data.resubmission_of_request_id !== expected.resubmissionOfRequestId
  ) {
    return null;
  }
  return { entryIds: parsed.data.entry_ids ?? [], requestId: parsed.data.request_id };
}

function parseReviewResult(
  data: unknown,
  expected: { decision: "approve" | "reject"; requestId: string },
): { requestId: string; entryIds: string[]; requestKind?: "initial" | "correction" } | null {
  const parsed = reviewResultSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.request_id !== expected.requestId ||
    parsed.data.status !== (expected.decision === "approve" ? "approved" : "rejected") ||
    (parsed.data.decision !== undefined && parsed.data.decision !== expected.decision) ||
    (expected.decision === "reject" && parsed.data.entry_ids.length !== 0)
  ) {
    return null;
  }
  return {
    entryIds: parsed.data.entry_ids,
    requestId: parsed.data.request_id,
    requestKind: parsed.data.request_kind,
  };
}

function unexpectedResponse(): OwnerBalanceActionState {
  return {
    errorCode: "unexpected_response",
    message: "The opening-balance command returned an unexpected result.",
    status: "error",
  };
}

function databaseError(error: unknown): OwnerBalanceActionState {
  const details = errorDetails(error);
  const normalized = details.message.toLowerCase();
  let errorCode: OwnerBalanceActionErrorCode = "database";
  let message = "We could not save the opening balance. Review it and try again.";

  if (details.code === "28000" || normalized.includes("not authenticated")) {
    errorCode = "authentication";
    message = "Sign in again before continuing.";
  } else if (details.code === "42501" || normalized.includes("not authorized")) {
    errorCode = "authorization";
    message = "Your role cannot perform this opening-balance action.";
  } else if (normalized.includes("financial month") && normalized.includes("locked")) {
    errorCode = "financial_month_locked";
    message = "This financial month is locked.";
  } else if (
    normalized.includes("evidence") ||
    normalized.includes("document") ||
    normalized.includes("fingerprint") ||
    normalized.includes("storage object")
  ) {
    errorCode = "evidence";
    message = "The verified opening evidence is unavailable or no longer eligible.";
  } else if (
    normalized.includes("idempotency") ||
    normalized.includes("payload conflict")
  ) {
    errorCode = "idempotency_conflict";
    message = "This replay key belongs to different opening-balance details.";
  } else if (
    normalized.includes("stale") ||
    normalized.includes("current authority") ||
    normalized.includes("already reversed") ||
    normalized.includes("correction target")
  ) {
    errorCode = "stale_target";
      message = "The correction target is no longer the current opening balance.";
  } else if (
    normalized.includes("roster") ||
    normalized.includes("owner_share") ||
    normalized.includes("ownership") ||
    normalized.includes("owner person")
  ) {
    errorCode = "ownership_roster";
    message = "Resolve the ownership roster before continuing.";
  } else if (details.code === "23503" || normalized.includes("not found")) {
    errorCode = "not_found";
    message = "The selected opening-balance record no longer exists.";
  }

  return { errorCode, message, status: "error" };
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    return {
      code: typeof value.code === "string" ? value.code : "",
      message: typeof value.message === "string" ? value.message : "",
    };
  }
  return { code: "", message: error instanceof Error ? error.message : "" };
}
