import { createHash } from "node:crypto";
import {
  requirePrivilegedStepUp,
  type PrivilegedStepUpRequestClient,
} from "@/lib/auth/privileged-step-up-guard";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { validateUploadedFileContent } from "@/lib/uploads/upload-content";

const ALLOWED_PAID_COST_EVIDENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_PAID_COST_EVIDENCE_BYTES = 10 * 1024 * 1024;

type PaidCostEvidenceInput = {
  actorId: string;
  file: File;
  idempotencyKey: string;
  organizationId: string;
  propertyId: string;
  requestClient?: PrivilegedStepUpRequestClient;
  taskId?: string;
};

export type PaidCostEvidenceResult = {
  contentSha256: string;
  documentId: string;
  storagePath: string;
};

export function validatePaidCostEvidenceFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    return "Choose a receipt evidence file.";
  }
  if (!ALLOWED_PAID_COST_EVIDENCE_TYPES.has(value.type)) {
    return "Use a PDF, JPEG, PNG, or WebP receipt evidence file.";
  }
  if (value.size > MAX_PAID_COST_EVIDENCE_BYTES) {
    return "Keep receipt evidence at or below 10 MB.";
  }
  return null;
}

export async function preparePaidCostEvidence(
  input: PaidCostEvidenceInput,
): Promise<PaidCostEvidenceResult> {
  return preparePaidCostEvidenceWithAuthority(input, () =>
    requirePrivilegedStepUp(
      { organizationId: input.organizationId, userId: input.actorId },
      input.requestClient,
    ),
  );
}

export async function preparePaidCostEvidenceForFixture(
  input: Omit<PaidCostEvidenceInput, "requestClient">,
): Promise<PaidCostEvidenceResult> {
  assertLocalFixtureAuthority();
  return preparePaidCostEvidenceWithAuthority(input, async () =>
    createSupabaseAdminClient(),
  );
}

function assertLocalFixtureAuthority() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let hostname: string;
  try {
    hostname = configuredUrl ? new URL(configuredUrl).hostname : "";
  } catch {
    hostname = "";
  }
  if (!["127.0.0.1", "[::1]", "localhost"].includes(hostname)) {
    throw new Error("Paid-cost fixture authority requires local Supabase.");
  }
}

async function preparePaidCostEvidenceWithAuthority({
  actorId,
  file,
  idempotencyKey,
  organizationId,
  propertyId,
  taskId,
}: PaidCostEvidenceInput, authorize: () => Promise<ReturnType<typeof createSupabaseAdminClient>>): Promise<PaidCostEvidenceResult> {
  const verifiedFile = await validateUploadedFileContent(file, [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (!verifiedFile.ok) {
    throw new Error("Receipt evidence content does not match its file type.");
  }
  const { bytes } = verifiedFile;
  const contentSha256 = sha256Hex(bytes);
  const pathDigest = sha256Hex(
    new TextEncoder().encode(
      `paid-cost-evidence-v1\0${organizationId}\0${actorId}\0${propertyId}\0${idempotencyKey}\0${contentSha256}`,
    ),
  );
  const storagePath = `${organizationId}/paid-cost-evidence/${pathDigest}`;
  const admin = await authorize();
  const bucket = admin.storage.from("nestory-documents");
  const upload = await bucket.upload(storagePath, bytes, {
    contentType: verifiedFile.contentType,
    upsert: false,
  });
  const uploadedNewObject = !upload.error;

  if (upload.error && !isExistingObjectError(upload.error)) {
    throw new Error("Receipt evidence upload failed.");
  }

  try {
    const retained = await bucket.download(storagePath);
    if (retained.error || !retained.data) {
      throw new Error("Receipt evidence retained bytes are unavailable.");
    }
    const retainedBytes = new Uint8Array(await retained.data.arrayBuffer());
    if (
      retainedBytes.byteLength !== bytes.byteLength ||
      sha256Hex(retainedBytes) !== contentSha256
    ) {
      throw new Error("Existing receipt evidence bytes conflict with this submission.");
    }

    const object = await admin.rpc("get_paid_cost_evidence_object", {
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_storage_path: storagePath,
      ...(taskId ? { p_task_id: taskId } : {}),
    });
    if (object.error) {
      throw new Error(
        object.error.message ?? "Receipt evidence object verification failed.",
      );
    }
    const objectIdentity = requiredObjectIdentity(object.data);
    if (
      objectIdentity.contentType !== verifiedFile.contentType ||
      objectIdentity.metadataSizeBytes !== retainedBytes.byteLength
    ) {
      throw new Error("Receipt evidence Storage metadata does not match retained bytes.");
    }

    const registration = await admin.rpc(
      "register_paid_cost_evidence_verified",
      {
        p_actor_id: actorId,
        p_content_sha256: contentSha256,
        p_content_type: objectIdentity.contentType,
        p_file_name: file.name,
        p_idempotency_key: evidenceReplayKey(
          idempotencyKey,
          organizationId,
          propertyId,
          contentSha256,
        ),
        p_organization_id: organizationId,
        p_property_id: propertyId,
        p_size_bytes: retainedBytes.byteLength,
        p_storage_object_id: objectIdentity.storageObjectId,
        p_storage_object_version: objectIdentity.storageObjectVersion,
        p_storage_path: storagePath,
        ...(taskId ? { p_task_id: taskId } : {}),
      },
    );
    if (registration.error) {
      throw new Error(
        registration.error.message ?? "Receipt evidence registration failed.",
      );
    }
    const documentId = requiredString(registration.data, "document_id");
    const registeredHash = requiredString(registration.data, "content_sha256");
    const registeredPath = requiredString(registration.data, "storage_path");
    const registeredSize =
      registration.data && typeof registration.data === "object"
        ? (registration.data as Record<string, unknown>).size_bytes
        : null;
    if (
      registeredHash !== contentSha256 ||
      registeredPath !== storagePath ||
      registeredSize !== retainedBytes.byteLength
    ) {
      throw new Error("Receipt evidence registration does not match retained bytes.");
    }

    return { contentSha256, documentId, storagePath };
  } catch (error) {
    if (uploadedNewObject) {
      await removeUnregisteredPaidCostEvidence({
        admin,
        organizationId,
        storagePath,
      });
    }

    throw error;
  }
}

async function removeUnregisteredPaidCostEvidence({
  admin,
  organizationId,
  storagePath,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  organizationId: string;
  storagePath: string;
}) {
  const claim = await admin.rpc("begin_paid_cost_evidence_cleanup", {
    p_organization_id: organizationId,
    p_storage_path: storagePath,
  });

  if (claim.error || claim.data !== true) {
    return;
  }

  try {
    await admin.storage.from("nestory-documents").remove([storagePath]);
  } finally {
    await admin.rpc("finish_paid_cost_evidence_cleanup", {
      p_organization_id: organizationId,
      p_storage_path: storagePath,
    });
  }
}

function evidenceReplayKey(
  idempotencyKey: string,
  organizationId: string,
  propertyId: string,
  contentSha256: string,
) {
  return `paid-cost-evidence-v1:${sha256Hex(
    new TextEncoder().encode(
      `${idempotencyKey}\0${organizationId}\0${propertyId}\0${contentSha256}`,
    ),
  )}`;
}

function requiredObjectIdentity(value: unknown) {
  const storageObjectId = requiredString(value, "storage_object_id");
  const storageObjectVersion = requiredString(value, "storage_object_version");
  const contentType = requiredString(value, "content_type");
  const metadataSizeBytes =
    value && typeof value === "object"
      ? (value as Record<string, unknown>).metadata_size_bytes
      : null;
  if (typeof metadataSizeBytes !== "number" || !Number.isSafeInteger(metadataSizeBytes)) {
    throw new Error("Receipt evidence object verification returned invalid metadata.");
  }
  return {
    contentType,
    metadataSizeBytes,
    storageObjectId,
    storageObjectVersion,
  };
}

function requiredString(value: unknown, key: string) {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)[key]
      : null;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error("Receipt evidence verification returned an invalid response.");
  }
  return candidate;
}

function isExistingObjectError(error: { message?: string; statusCode?: string }) {
  return error.statusCode === "409" || /already exists|duplicate/i.test(error.message ?? "");
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
