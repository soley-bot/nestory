import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePrivilegedStepUp } from "@/lib/auth/privileged-step-up-guard";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import type { Database, Json } from "@/types/database";
import {
  loadTenantInvoicePdfModel,
  loadTenantReceiptPdfModel,
  type InvoicePublicationInput,
} from "@/features/finance-operations/documents/commercial-document-data";
import type {
  TenantInvoicePdfModel,
  TenantReceiptPdfModel,
} from "@/features/finance-operations/documents/commercial-document.types";
import { buildTenantInvoicePdf } from "@/features/finance-operations/documents/invoice-pdf";
import { buildTenantReceiptPdf } from "@/features/finance-operations/documents/receipt-pdf";

const BUCKET = "tenant-commercial-documents";
const CONTENT_TYPE = "application/pdf";
const IMMUTABLE_CACHE_CONTROL = "31536000";
const COMMERCIAL_DOCUMENT_RENDERER_VERSION = "commercial-pdf-v1";

export type PublishedCommercialDocument = {
  artifactId: string;
  documentNumber: string;
  href: string;
};

type SourceKind = "invoice" | "receipt";

type StorageObjectIdentity = {
  id: string;
  version: string;
};

type ExactObject = StorageObjectIdentity & {
  organizationId: string;
  path: string;
  sourceId: string;
  sourceKind: SourceKind;
};

type BoundaryResult = {
  data: unknown;
  error: { message?: string; statusCode?: string } | null;
};

type CommercialDocumentAdminClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<BoundaryResult>;
  storage: {
    from(name: typeof BUCKET): CommercialDocumentBucket;
  };
};

type CommercialDocumentBucket = {
  download(path: string): PromiseLike<{
    data: Blob | null;
    error: { message?: string } | null;
  }>;
  info(path: string): PromiseLike<BoundaryResult>;
  remove(paths: string[]): PromiseLike<BoundaryResult>;
  upload(
    path: string,
    bytes: Uint8Array,
    options: {
      cacheControl: string;
      contentType: typeof CONTENT_TYPE;
      upsert: false;
    },
  ): PromiseLike<BoundaryResult>;
};

export async function publishTenantInvoiceArtifact(input: {
  actorId: string;
  client: SupabaseClient<Database>;
  invoiceId: string;
  organizationId: string;
  publicationInput: InvoicePublicationInput;
}): Promise<PublishedCommercialDocument> {
  const source = await loadPublicationSource(
    input.client,
    input.organizationId,
    "invoice",
    input.invoiceId,
  );
  const existing = publishedFromSource(source);
  if (existing) return existing;

  const model = await loadTenantInvoicePdfModel(
    replaySourceClient(input.client, source),
    input.organizationId,
    input.invoiceId,
    input.publicationInput,
  );
  return publishArtifact({
    bytes: buildTenantInvoicePdf(model),
    actorId: input.actorId,
    client: input.client,
    documentNumber: model.invoiceNumber,
    model,
    organizationId: input.organizationId,
    sourceId: input.invoiceId,
    sourceKind: "invoice",
  });
}

export async function publishTenantReceiptArtifact(input: {
  actorId: string;
  client: SupabaseClient<Database>;
  organizationId: string;
  paymentId: string;
}): Promise<PublishedCommercialDocument> {
  const source = await loadPublicationSource(
    input.client,
    input.organizationId,
    "receipt",
    input.paymentId,
  );
  const existing = publishedFromSource(source);
  if (existing) return existing;

  const model = await loadTenantReceiptPdfModel(
    replaySourceClient(input.client, source),
    input.organizationId,
    input.paymentId,
  );
  return publishArtifact({
    bytes: buildTenantReceiptPdf(model),
    actorId: input.actorId,
    client: input.client,
    documentNumber: model.receiptNumber,
    model,
    organizationId: input.organizationId,
    sourceId: input.paymentId,
    sourceKind: "receipt",
  });
}

export async function markReceiptPublicationFailed(
  client: SupabaseClient<Database>,
  organizationId: string,
  paymentId: string,
  message: string,
): Promise<void> {
  const result = await client.rpc(
    "mark_tenant_commercial_document_publication_failed",
    {
      p_failure_reason: normalizeFailureMessage(message),
      p_organization_id: organizationId,
      p_source_id: paymentId,
      p_source_kind: "receipt",
    },
  );
  if (result.error) {
    throw new Error("Tenant Receipt publication failure could not be recorded.");
  }
}

export async function downloadTenantCommercialDocumentArtifact(
  client: SupabaseClient<Database>,
  organizationId: string,
  artifactId: string,
) {
  let metadataResult;
  try {
    metadataResult = await client.rpc(
      "get_tenant_commercial_document_artifact_download",
      {
        p_artifact_id: artifactId,
        p_organization_id: organizationId,
      },
    );
  } catch {
    throw new Error("Tenant commercial document artifact is unavailable.");
  }
  if (metadataResult.error) {
    throw new Error("Tenant commercial document artifact is unavailable.");
  }

  const metadataValue = Array.isArray(metadataResult.data)
    ? metadataResult.data[0]
    : metadataResult.data;
  const metadata = record(
    metadataValue,
    "Invalid tenant commercial document artifact metadata.",
  );
  const sourceKind = sourceKindValue(metadata.source_kind);
  const documentNumber = requiredString(metadata.document_number);
  const storagePath = requiredString(metadata.storage_path);
  const sha256 = sha256Value(metadata.sha256);
  const sizeBytes = positiveInteger(metadata.size_bytes);
  const sourceState = requiredString(metadata.source_state);
  if (
    metadata.publication_status !== "published" ||
    metadata.content_type !== CONTENT_TYPE
  ) {
    throw new Error("Tenant commercial document artifact is unavailable.");
  }

  const admin = adminClient();
  let stored: Awaited<ReturnType<CommercialDocumentBucket["download"]>>;
  try {
    stored = await admin.storage.from(BUCKET).download(storagePath);
  } catch {
    throw new Error("Tenant commercial document artifact bytes are unavailable.");
  }
  if (stored.error || !stored.data) {
    throw new Error("Tenant commercial document artifact bytes are unavailable.");
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await stored.data.arrayBuffer());
  } catch {
    throw new Error(
      "Tenant commercial document integrity verification failed.",
    );
  }
  if (bytes.byteLength !== sizeBytes || sha256Hex(bytes) !== sha256) {
    throw new Error(
      "Tenant commercial document integrity verification failed.",
    );
  }

  return {
    bytes,
    contentType: CONTENT_TYPE,
    filename: `${sourceKind}-${safeDocumentNumber(documentNumber)}.pdf`,
    sourceState,
  };
}

async function publishArtifact({
  actorId,
  bytes,
  client,
  documentNumber,
  model,
  organizationId,
  sourceId,
  sourceKind,
}: {
  actorId: string;
  bytes: Uint8Array;
  client: SupabaseClient<Database>;
  documentNumber: string;
  model: TenantInvoicePdfModel | TenantReceiptPdfModel;
  organizationId: string;
  sourceId: string;
  sourceKind: SourceKind;
}): Promise<PublishedCommercialDocument> {
  const safeNumber = safeDocumentNumber(documentNumber);
  if (!safeNumber) throw new Error("Invalid commercial document number.");
  const storagePath =
    `${organizationId}/${sourceKind}/${sourceId}/${safeNumber}.pdf`;
  const sha256 = sha256Hex(bytes);
  const snapshot = presentationSnapshot(model);
  const admin = (await requirePrivilegedStepUp(
    { organizationId, userId: actorId },
    client,
  )) as unknown as CommercialDocumentAdminClient;
  const bucket = admin.storage.from(BUCKET);
  let upload: BoundaryResult;
  try {
    upload = await bucket.upload(storagePath, bytes, {
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      contentType: CONTENT_TYPE,
      upsert: false,
    });
  } catch {
    const concurrent = await reconcilePublishedArtifact(
      client,
      organizationId,
      sourceKind,
      sourceId,
    );
    if (concurrent) return concurrent;
    try {
      await readCurrentObject(bucket, storagePath);
    } catch {
      // Freshness is indeterminate after a thrown upload response. An info
      // failure cannot authorize cleanup and is normalized below.
    }
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  if (upload.error && !isExistingObjectError(upload.error)) {
    throw new Error(publicationMessage(sourceKind, "upload failed"));
  }
  let uploadedObjectId: string | null = null;
  if (!upload.error) {
    try {
      const uploadData = record(upload.data, "Invalid Storage upload identity.");
      uploadedObjectId = requiredString(uploadData.id);
      if (requiredString(uploadData.path) !== storagePath) {
        throw new Error("Invalid Storage upload identity.");
      }
    } catch {
      const concurrent = await reconcilePublishedArtifact(
        client,
        organizationId,
        sourceKind,
        sourceId,
      );
      if (concurrent) return concurrent;
      try {
        await readCurrentObject(bucket, storagePath);
      } catch {
        // The object is preserved because its successful upload identity was
        // not returned in a usable form.
      }
      throw new Error(publicationMessage(sourceKind, "requires operator review"));
    }
  }
  const uploadedNewObject = uploadedObjectId !== null;

  const failRetainedVerification = () =>
    failAfterUpload({
      admin,
      bucket,
      client,
      error: new Error(
        publicationMessage(sourceKind, "retained-byte verification failed"),
      ),
      organizationId,
      sourceId,
      sourceKind,
      storagePath,
      uploadedNewObject,
      uploadedObjectId,
    });
  let retained: Awaited<ReturnType<CommercialDocumentBucket["download"]>>;
  try {
    retained = await bucket.download(storagePath);
  } catch {
    return failRetainedVerification();
  }
  if (retained.error || !retained.data) {
    return failRetainedVerification();
  }
  let retainedBytes: Uint8Array;
  try {
    retainedBytes = new Uint8Array(await retained.data.arrayBuffer());
  } catch {
    return failRetainedVerification();
  }
  if (
    retainedBytes.byteLength !== bytes.byteLength ||
    sha256Hex(retainedBytes) !== sha256
  ) {
    return failRetainedVerification();
  }

  let identity: StorageObjectIdentity | null;
  try {
    identity = await readCurrentObject(bucket, storagePath);
  } catch {
    const concurrent = await reconcilePublishedArtifact(
      client,
      organizationId,
      sourceKind,
      sourceId,
    );
    if (concurrent) return concurrent;
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  if (!identity) {
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  if (uploadedObjectId !== null && identity.id !== uploadedObjectId) {
    const concurrent = await reconcilePublishedArtifact(
      client,
      organizationId,
      sourceKind,
      sourceId,
    );
    if (concurrent) return concurrent;
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  const exactObject: ExactObject = {
    ...identity,
    organizationId,
    path: storagePath,
    sourceId,
    sourceKind,
  };

  try {
    const attestation = await admin.rpc(
      "attest_tenant_commercial_document_upload",
      {
        p_actor_id: actorId,
        p_organization_id: organizationId,
        p_presentation_snapshot: snapshot,
        p_renderer_version: COMMERCIAL_DOCUMENT_RENDERER_VERSION,
        p_sha256: sha256,
        p_size_bytes: retainedBytes.byteLength,
        p_source_id: sourceId,
        p_source_kind: sourceKind,
        p_storage_object_id: identity.id,
        p_storage_object_version: identity.version,
        p_storage_path: storagePath,
      },
    );
    if (attestation.error) throw new Error("attestation failed");

    const registration = await client.rpc(
      "register_tenant_commercial_document_artifact",
      {
        p_filename: `${sourceKind}-${safeNumber}.pdf`,
        p_organization_id: organizationId,
        p_presentation_snapshot: snapshot,
        p_renderer_version: COMMERCIAL_DOCUMENT_RENDERER_VERSION,
        p_sha256: sha256,
        p_size_bytes: retainedBytes.byteLength,
        p_source_id: sourceId,
        p_source_kind: sourceKind,
        p_storage_path: storagePath,
      },
    );
    if (registration.error) throw new Error("registration failed");
    return publishedResult(requiredString(registration.data), documentNumber);
  } catch {
    const concurrent = await reconcilePublishedArtifact(
      client,
      organizationId,
      sourceKind,
      sourceId,
    );
    if (concurrent) return concurrent;

    if (!uploadedNewObject) {
      throw new Error(publicationMessage(sourceKind, "requires operator review"));
    }

    const cleanup = await cleanupExactObject({
      admin,
      bucket,
      client,
      exactObject,
    });
    if (cleanup.artifact) return cleanup.artifact;
    if (cleanup.operatorReview) {
      throw new Error(publicationMessage(sourceKind, "requires operator review"));
    }
    throw new Error(publicationMessage(sourceKind, "publication failed"));
  }
}

async function failAfterUpload({
  admin,
  bucket,
  client,
  error,
  organizationId,
  sourceId,
  sourceKind,
  storagePath,
  uploadedNewObject,
  uploadedObjectId,
}: {
  admin: CommercialDocumentAdminClient;
  bucket: CommercialDocumentBucket;
  client: SupabaseClient<Database>;
  error: Error;
  organizationId: string;
  sourceId: string;
  sourceKind: SourceKind;
  storagePath: string;
  uploadedNewObject: boolean;
  uploadedObjectId: string | null;
}): Promise<never> {
  const concurrent = await reconcilePublishedArtifact(
    client,
    organizationId,
    sourceKind,
    sourceId,
  );
  if (concurrent) return concurrent as never;
  if (!uploadedNewObject) {
    try {
      await readCurrentObject(bucket, storagePath);
    } catch {
      // The object is preserved regardless; a failed identity read remains an
      // operator-review state and must not expose the provider error.
    }
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }

  let identity: StorageObjectIdentity | null;
  try {
    identity = await readCurrentObject(bucket, storagePath);
  } catch {
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  if (!identity) throw error;
  if (uploadedObjectId === null || identity.id !== uploadedObjectId) {
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  const exactObject: ExactObject = {
    ...identity,
    organizationId,
    path: storagePath,
    sourceId,
    sourceKind,
  };
  const cleanup = await cleanupExactObject({
    admin,
    bucket,
    client,
    exactObject,
  });
  if (cleanup.artifact) return cleanup.artifact as never;
  if (cleanup.operatorReview) {
    throw new Error(publicationMessage(sourceKind, "requires operator review"));
  }
  throw error;
}

async function cleanupExactObject({
  admin,
  bucket,
  client,
  exactObject,
}: {
  admin: CommercialDocumentAdminClient;
  bucket: CommercialDocumentBucket;
  client: SupabaseClient<Database>;
  exactObject: ExactObject;
}): Promise<{
  artifact?: PublishedCommercialDocument;
  operatorReview: boolean;
}> {
  let currentBeforeClaim: StorageObjectIdentity | null;
  try {
    currentBeforeClaim = await readCurrentObject(bucket, exactObject.path);
  } catch {
    return reconcileIndeterminate(client, bucket, exactObject);
  }
  if (!sameIdentity(currentBeforeClaim, exactObject)) {
    return { operatorReview: false };
  }

  const exactArgs = cleanupArgs(exactObject);
  let claim: BoundaryResult;
  try {
    claim = await admin.rpc(
      "begin_tenant_commercial_document_cleanup",
      exactArgs,
    );
  } catch {
    return reconcileIndeterminate(client, bucket, exactObject);
  }
  if (claim.error || typeof claim.data !== "string" || claim.data.length === 0) {
    return reconcileIndeterminate(client, bucket, exactObject);
  }

  const claimId = claim.data;
  let currentAfterClaim: StorageObjectIdentity | null;
  try {
    currentAfterClaim = await readCurrentObject(bucket, exactObject.path);
  } catch {
    return reconcileIndeterminate(client, bucket, exactObject);
  }

  if (sameIdentity(currentAfterClaim, exactObject)) {
    try {
      await bucket.remove([exactObject.path]);
    } catch {
      // A provider error/timeout is ambiguous. The exact database finish call
      // below determines whether the claimed identity is absent or replaced.
    }
  }

  let finish: BoundaryResult;
  try {
    finish = await admin.rpc(
      "finish_tenant_commercial_document_cleanup",
      {
        ...exactArgs,
        p_cleanup_claim_id: claimId,
      },
    );
  } catch {
    return reconcileIndeterminate(client, bucket, exactObject);
  }
  if (!finish.error && finish.data === true) {
    return { operatorReview: false };
  }
  return reconcileIndeterminate(client, bucket, exactObject);
}

async function reconcileIndeterminate(
  client: SupabaseClient<Database>,
  bucket: CommercialDocumentBucket,
  exactObject: ExactObject,
) {
  const artifact = await reconcilePublishedArtifact(
    client,
    exactObject.organizationId,
    exactObject.sourceKind,
    exactObject.sourceId,
  );
  if (artifact) return { artifact, operatorReview: false };
  try {
    const current = await readCurrentObject(bucket, exactObject.path);
    return { operatorReview: sameIdentity(current, exactObject) };
  } catch {
    return { operatorReview: true };
  }
}

async function reconcilePublishedArtifact(
  client: SupabaseClient<Database>,
  organizationId: string,
  sourceKind: SourceKind,
  sourceId: string,
) {
  try {
    const source = await loadPublicationSource(
      client,
      organizationId,
      sourceKind,
      sourceId,
    );
    return publishedFromSource(source);
  } catch {
    return null;
  }
}

async function loadPublicationSource(
  client: SupabaseClient<Database>,
  organizationId: string,
  sourceKind: SourceKind,
  sourceId: string,
) {
  const result = await client.rpc(
    "get_tenant_commercial_document_publication_source",
    {
      p_organization_id: organizationId,
      p_source_id: sourceId,
      p_source_kind: sourceKind,
    },
  );
  if (result.error) {
    throw new Error(
      sourceKind === "invoice"
        ? "Tenant Invoice source is unavailable."
        : "Tenant Receipt source is unavailable.",
    );
  }
  return record(result.data, "Invalid commercial document publication source.");
}

function replaySourceClient(
  client: SupabaseClient<Database>,
  source: Record<string, unknown>,
) {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "rpc") {
        return async (name: string, args: Record<string, unknown>) => {
          if (name === "get_tenant_commercial_document_publication_source") {
            return { data: source, error: null };
          }
          return Reflect.apply(target.rpc, target, [name, args]);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SupabaseClient<Database>;
}

function publishedFromSource(
  source: Record<string, unknown>,
): PublishedCommercialDocument | null {
  if (source.artifact === null || source.artifact === undefined) return null;
  const artifact = record(source.artifact, "Invalid commercial document artifact.");
  if (artifact.publication_status !== "published") return null;
  return publishedResult(
    requiredString(artifact.id),
    requiredString(artifact.document_number),
  );
}

async function readCurrentObject(
  bucket: CommercialDocumentBucket,
  storagePath: string,
): Promise<StorageObjectIdentity | null> {
  const result = await bucket.info(storagePath);
  if (result.error) {
    if (
      result.error.statusCode === "404" ||
      /not found/i.test(result.error.message ?? "")
    ) {
      return null;
    }
    throw new Error("Storage object identity is unavailable.");
  }
  if (result.data === null) return null;
  const row = record(result.data, "Invalid Storage object identity.");
  return {
    id: requiredString(row.id),
    version: requiredString(row.version),
  };
}

function cleanupArgs(exactObject: ExactObject) {
  return {
    p_organization_id: exactObject.organizationId,
    p_source_id: exactObject.sourceId,
    p_source_kind: exactObject.sourceKind,
    p_storage_object_id: exactObject.id,
    p_storage_object_version: exactObject.version,
    p_storage_path: exactObject.path,
  };
}

function sameIdentity(
  current: StorageObjectIdentity | null,
  expected: StorageObjectIdentity,
) {
  return (
    current !== null &&
    current.id === expected.id &&
    current.version === expected.version
  );
}

function presentationSnapshot(
  model: TenantInvoicePdfModel | TenantReceiptPdfModel,
): Json {
  const issuer = {
    ...(model.issuer.contactEmail !== undefined
      ? { contactEmail: model.issuer.contactEmail }
      : {}),
    ...(model.issuer.contactPhone !== undefined
      ? { contactPhone: model.issuer.contactPhone }
      : {}),
    name: model.issuer.name,
  };
  return { ...model, issuer } as Json;
}

function normalizeFailureMessage(message: string) {
  const stable = new Set([
    "integrity_verification_failed",
    "publication_failed",
    "storage_unavailable",
  ]);
  return stable.has(message) ? message : "storage_unavailable";
}

function publishedResult(artifactId: string, documentNumber: string) {
  return {
    artifactId,
    documentNumber,
    href: `/api/finance/documents/${artifactId}`,
  };
}

function publicationMessage(
  sourceKind: SourceKind,
  detail:
    | "publication failed"
    | "requires operator review"
    | "retained-byte verification failed"
    | "upload failed",
) {
  const subject =
    `Tenant ${sourceKind === "invoice" ? "Invoice" : "Receipt"} PDF`;
  return detail === "requires operator review"
    ? `${subject} publication requires operator review.`
    : `${subject} ${detail}.`;
}

function isExistingObjectError(error: {
  message?: string;
  statusCode?: string;
}) {
  return (
    error.statusCode === "409" ||
    /already exists|duplicate/i.test(error.message ?? "")
  );
}

function safeDocumentNumber(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceKindValue(value: unknown): SourceKind {
  if (value !== "invoice" && value !== "receipt") {
    throw new Error("Invalid tenant commercial document artifact metadata.");
  }
  return value;
}

function sha256Value(value: unknown) {
  const result = requiredString(value);
  if (!/^[0-9a-f]{64}$/.test(result)) {
    throw new Error("Invalid tenant commercial document artifact metadata.");
  }
  return result;
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid tenant commercial document artifact metadata.");
  }
  return value;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid commercial document response.");
  }
  return value;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function adminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Commercial document provider operations are server-only.");
  }
  return createSupabaseAdminClient() as unknown as CommercialDocumentAdminClient;
}
