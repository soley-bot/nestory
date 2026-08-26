import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  from: vi.fn(),
  requireCorrection: vi.fn(),
  requireReview: vi.fn(),
  requireSubmission: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireOwnerOpeningBalanceCorrectionContext: mocks.requireCorrection,
  requireOwnerOpeningBalanceReviewContext: mocks.requireReview,
  requireOwnerOpeningBalanceSubmissionContext: mocks.requireSubmission,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  })),
}));
vi.mock("@/features/documents/storage-cleanup", () => ({
  removeUnregisteredDocumentObject: mocks.cleanup,
}));

import {
  reviewOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceCorrectionAction,
} from "@/features/owner-balances/actions";
import {
  invalidPdfFile,
  validPdfBytes,
  validPdfFile,
} from "@/test-utils/upload-content";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerPersonId = "00000000-0000-4000-8000-000000000003";
const documentId = "00000000-0000-4000-8000-000000000004";
const predecessorId = "00000000-0000-4000-8000-000000000005";
const requestId = "00000000-0000-4000-8000-000000000006";
const entryId = "00000000-0000-4000-8000-000000000007";
const reversalId = "00000000-0000-4000-8000-000000000008";
const replacementId = "00000000-0000-4000-8000-000000000009";
const hash = "a".repeat(64);
const actorId = "00000000-0000-4000-8000-000000000010";
const initialDocumentId = "5e15066a-0f1b-0d6f-f0b1-00e13d8642c0";
const initialStoragePath = `${organizationId}/owner-opening/${initialDocumentId}`;
const validPdfHash = "50dc246b4ff9509811a23d9fcf7d6c8465ed2b4eed08aa049d9feae8e8afd526";
const validPdfSize = validPdfBytes().byteLength;

describe("owner opening balance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubmission.mockResolvedValue({
      organizationId,
      userId: actorId,
    });
    mocks.requireCorrection.mockResolvedValue({
      organizationId,
      userId: actorId,
    });
    mocks.requireReview.mockResolvedValue({ organizationId, userId: ownerPersonId });
    mocks.from.mockReturnValue(requestKindQuery("initial"));
    mocks.rpc.mockResolvedValue({
      data: {
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "submitted",
      },
      error: null,
    });
    mocks.storageFrom.mockReturnValue({
      download: vi.fn(async () => ({ data: null, error: null })),
      upload: vi.fn(async () => ({ data: { path: "uploaded" }, error: null })),
    });
  });

  it("uploads new evidence only inside the final initial command and calls the atomic wrapper", async () => {
    const file = validPdfFile("opening.pdf");
    const form = initialForm();
    form.set("evidenceFile", file);
    form.set("supportingDocumentId", "");
    form.set("evidenceSha256", validPdfHash);
    mocks.rpc.mockResolvedValue({
      data: {
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "submitted",
      },
      error: null,
    });

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      requestId,
      status: "success",
    });

    const storage = mocks.storageFrom.mock.results[0]!.value;
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${organizationId}/owner-opening/[0-9a-f-]{36}$`)),
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "application/pdf", upsert: false }),
    );
    const storagePath = storage.upload.mock.calls[0]![0];
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_owner_opening_balance_with_document",
      expect.objectContaining({
        p_document_file_name: "opening.pdf",
        p_document_mime_type: "application/pdf",
        p_document_size_bytes: validPdfSize,
        p_document_storage_path: storagePath,
        p_evidence_sha256: validPdfHash,
        p_idempotency_key: "initial-request-key",
        p_organization_id: organizationId,
      }),
    );
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("rejects spoofed evidence content before opening Storage", async () => {
    const form = initialForm();
    form.set("evidenceFile", invalidPdfFile("opening.pdf"));
    form.set(
      "evidenceSha256",
      "6d689ba9522127c0c759535f5adb7f2c8f182ac280d94eab93cb54e5ec598fa0",
    );

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "evidence",
      status: "error",
    });

    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("removes only a newly uploaded unregistered object after the atomic wrapper fails", async () => {
    const file = validPdfFile("opening.pdf");
    const form = initialForm();
    form.set("evidenceFile", file);
    form.set("evidenceSha256", validPdfHash);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "owner_share_total_not_100" },
    });

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "ownership_roster",
      status: "error",
    });

    const storagePath = mocks.storageFrom.mock.results[0]!.value.upload.mock.calls[0]![0];
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledWith(expect.anything(), storagePath);
  });

  it("cleans a newly uploaded object after a network failure and returns a recoverable error", async () => {
    const file = validPdfFile("opening.pdf");
    const form = initialForm();
    form.set("evidenceFile", file);
    form.set("evidenceSha256", validPdfHash);
    mocks.rpc.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "database",
      status: "error",
    });
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it("reuses an exact pre-existing retry object without overwriting or cleanup", async () => {
    const bytes = validPdfBytes();
    const file = new File([bytes], "opening.pdf", { type: "application/pdf" });
    const storage = {
      download: vi.fn(async () => ({
        data: new Blob([bytes], { type: "application/pdf" }),
        error: null,
      })),
      upload: vi.fn(async () => ({
        data: null,
        error: { message: "The resource already exists", statusCode: "409" },
      })),
    };
    mocks.storageFrom.mockReturnValue(storage);
    mocks.from.mockReturnValue(documentLookup({
      archived_at: null,
      content_sha256: validPdfHash,
      file_name: "opening.pdf",
      id: initialDocumentId,
      mime_type: "application/pdf",
      organization_id: organizationId,
      size_bytes: validPdfSize,
      storage_path: initialStoragePath,
      uploaded_by: actorId,
    }));
    const form = initialForm();
    form.set("evidenceFile", file);
    form.set("evidenceSha256", validPdfHash);

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      status: "success",
    });

    expect(storage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Uint8Array),
      expect.objectContaining({ upsert: false }),
    );
    expect(storage.download).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_owner_opening_balance_with_document",
      expect.any(Object),
    );
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("rejects changed file metadata for a pre-existing exact-path retry", async () => {
    const bytes = validPdfBytes();
    const file = new File([bytes], "renamed.pdf", { type: "application/pdf" });
    mocks.storageFrom.mockReturnValue({
      download: vi.fn(async () => ({
        data: new Blob([bytes], { type: "application/pdf" }),
        error: null,
      })),
      upload: vi.fn(async () => ({
        data: null,
        error: { message: "The resource already exists", statusCode: "409" },
      })),
    });
    mocks.from.mockReturnValue(documentLookup({
      archived_at: null,
      content_sha256: validPdfHash,
      file_name: "opening.pdf",
      id: initialDocumentId,
      mime_type: "application/pdf",
      organization_id: organizationId,
      size_bytes: validPdfSize,
      storage_path: initialStoragePath,
      uploaded_by: actorId,
    }));
    const form = initialForm();
    form.set("evidenceFile", file);
    form.set("evidenceSha256", validPdfHash);

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "evidence",
      status: "error",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("rejects changed bytes for the same key without deleting the pre-existing object", async () => {
    const file = new File([new Uint8Array([9, 9, 9])], "opening.pdf", {
      type: "application/pdf",
    });
    mocks.storageFrom.mockReturnValue({
      download: vi.fn(async () => ({
        data: new Blob([validPdfBytes()], { type: "application/pdf" }),
        error: null,
      })),
      upload: vi.fn(async () => ({
        data: null,
        error: { message: "The resource already exists", statusCode: "409" },
      })),
    });
    const form = initialForm();
    form.set("evidenceFile", file);
    form.set("evidenceSha256", "e740a6faf2db65f5853148d75d9a335d7c4b94ab106fe5f237bc34fdcfc74584");

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "evidence",
      status: "error",
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("submits an initial opening with exact strings and caller replay identity", async () => {
    const form = initialForm();
    form.set("amount", "999999999999.9");
    form.set("supportingDocumentId", documentId);

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toEqual({
      entryIds: [],
      message: "Opening balance submitted for review.",
      requestId,
      status: "success",
    });
    expect(mocks.requireSubmission).toHaveBeenCalledOnce();
    expect(mocks.requireCorrection).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("submit_owner_opening_balance", {
      p_amount: "999999999999.90",
      p_component: "ips_held_owner_cash",
      p_currency: "USD",
      p_effective_date: "2026-08-01",
      p_evidence_sha256: hash,
      p_idempotency_key: "initial-request-key",
      p_organization_id: organizationId,
      p_owner_person_id: ownerPersonId,
      p_property_id: propertyId,
      p_reason: "Reconciled opening evidence",
      p_resubmission_of_request_id: null,
      p_source_reference: "IPS opening workbook row 8",
      p_supporting_document_id: documentId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
  });

  it("passes the latest rejected predecessor without changing the idempotency key", async () => {
    const form = initialForm();
    form.set("resubmissionOfRequestId", predecessorId);
    form.set("idempotencyKey", "stable-resubmit-key");
    mocks.rpc.mockResolvedValue({
      data: {
        request_id: requestId,
        resubmission_of_request_id: predecessorId,
        status: "submitted",
      },
      error: null,
    });

    await submitOwnerOpeningBalanceAction({}, form);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_owner_opening_balance",
      expect.objectContaining({
        p_idempotency_key: "stable-resubmit-key",
        p_resubmission_of_request_id: predecessorId,
      }),
    );
  });

  it("submits a correction amount as canonical text and never accepts a client authority key", async () => {
    const form = correctionForm();
    form.set("replacementAmount", "0");
    mocks.rpc.mockResolvedValue({
      data: {
        correction_of_entry_id: entryId,
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "submitted",
      },
      error: null,
    });

    await expect(
      submitOwnerOpeningBalanceCorrectionAction({}, form),
    ).resolves.toMatchObject({ requestId, status: "success" });
    expect(mocks.requireCorrection).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_owner_opening_balance_correction",
      {
        p_entry_id: entryId,
        p_evidence_sha256: hash,
        p_idempotency_key: "correction-request-key",
        p_organization_id: organizationId,
        p_reason: "Correct reconciled opening",
        p_replacement_amount: "0.00",
        p_resubmission_of_request_id: null,
        p_source_reference: "IPS corrected workbook row 8",
        p_supporting_document_id: null,
      },
    );
  });

  it("uses the correction-specific atomic wrapper without broadening correction authority", async () => {
    const file = validPdfFile("correction.pdf");
    const form = correctionForm();
    form.set("propertyId", propertyId);
    form.set("evidenceFile", file);
    form.set("evidenceSha256", validPdfHash);
    mocks.rpc.mockResolvedValue({
      data: {
        correction_of_entry_id: entryId,
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "submitted",
      },
      error: null,
    });

    await expect(
      submitOwnerOpeningBalanceCorrectionAction({}, form),
    ).resolves.toMatchObject({ requestId, status: "success" });

    expect(mocks.requireCorrection).toHaveBeenCalledOnce();
    expect(mocks.requireSubmission).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "submit_owner_opening_balance_correction_with_document",
      expect.objectContaining({
        p_document_file_name: "correction.pdf",
        p_entry_id: entryId,
        p_idempotency_key: "correction-request-key",
        p_organization_id: organizationId,
      }),
    );
  });

  it("reviews through the independent-review context and returns exact entry IDs", async () => {
    mocks.from.mockReturnValue(requestKindQuery("correction"));
    mocks.rpc.mockResolvedValue({
      data: {
        entry_ids: [reversalId, replacementId],
        request_id: requestId,
        status: "approved",
      },
      error: null,
    });
    const form = reviewForm("approve");

    await expect(reviewOwnerOpeningBalanceAction({}, form)).resolves.toEqual({
      entryIds: [reversalId, replacementId],
      message: "Opening balance approved.",
      requestId,
      status: "success",
    });
    expect(mocks.requireReview).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("review_owner_opening_balance", {
      p_decision: "approve",
      p_idempotency_key: "review-request-key",
      p_organization_id: organizationId,
      p_request_id: requestId,
      p_review_reason: null,
    });
  });

  it("accepts exactly one entry for an approved initial request", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        entry_ids: [entryId],
        request_id: requestId,
        status: "approved",
      },
      error: null,
    });

    await expect(
      reviewOwnerOpeningBalanceAction({}, reviewForm("approve")),
    ).resolves.toMatchObject({ entryIds: [entryId], status: "success" });
  });

  it("requires a rejection reason and does not call the review context", async () => {
    const form = reviewForm("reject");

    await expect(reviewOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "validation",
      status: "error",
    });
    expect(mocks.requireReview).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts a rejection result only when it has no entries", async () => {
    mocks.rpc.mockResolvedValue({
      data: { entry_ids: [], request_id: requestId, status: "rejected" },
      error: null,
    });
    const form = reviewForm("reject");
    form.set("reviewReason", "Evidence needs reconciliation");

    await expect(reviewOwnerOpeningBalanceAction({}, form)).resolves.toEqual({
      entryIds: [],
      message: "Opening balance rejected.",
      requestId,
      status: "success",
    });
  });

  it.each([
    "-1.00",
    "1.001",
    "1,000.00",
    "1e2",
    "+1.00",
    " 1.00",
    "01.00",
    "9999999999999.99",
  ])("rejects invalid amount text %j before acquiring authority", async (amount) => {
    const form = initialForm();
    form.set("amount", amount);

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "validation",
      status: "error",
    });
    expect(mocks.requireSubmission).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires real evidence identity instead of inventing a document or hash", async () => {
    const form = initialForm();
    form.set("sourceReference", "");
    form.set("supportingDocumentId", "");
    form.set("evidenceSha256", "opening.pdf");

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "validation",
      status: "error",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["a", "ab"])(
    "rejects an initial source reference shorter than three characters: %j",
    async (sourceReference) => {
      const form = initialForm();
      form.set("sourceReference", sourceReference);

      await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
        errorCode: "validation",
        status: "error",
      });
      expect(mocks.requireSubmission).not.toHaveBeenCalled();
    },
  );

  it.each(["a", "ab"])(
    "rejects a correction source reference shorter than three characters: %j",
    async (sourceReference) => {
      const form = correctionForm();
      form.set("sourceReference", sourceReference);

      await expect(
        submitOwnerOpeningBalanceCorrectionAction({}, form),
      ).resolves.toMatchObject({ errorCode: "validation", status: "error" });
      expect(mocks.requireCorrection).not.toHaveBeenCalled();
    },
  );

  it("accepts a three-character source reference for both submission kinds", async () => {
    const initial = initialForm();
    initial.set("sourceReference", "abc");
    await expect(submitOwnerOpeningBalanceAction({}, initial)).resolves.toMatchObject({
      status: "success",
    });

    mocks.rpc.mockResolvedValue({
      data: {
        correction_of_entry_id: entryId,
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "submitted",
      },
      error: null,
    });
    const correction = correctionForm();
    correction.set("sourceReference", "abc");
    await expect(
      submitOwnerOpeningBalanceCorrectionAction({}, correction),
    ).resolves.toMatchObject({ status: "success" });
  });

  it.each([
    [{ request_id: requestId }, initialForm()],
    [
      {
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "approved",
      },
      initialForm(),
    ],
    [
      {
        request_id: requestId,
        resubmission_of_request_id: predecessorId,
        status: "submitted",
      },
      initialForm(),
    ],
  ])("rejects a malformed or semantically mismatched initial result", async (data, form) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(submitOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "unexpected_response",
      status: "error",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a correction result for a different target", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        correction_of_entry_id: predecessorId,
        request_id: requestId,
        resubmission_of_request_id: null,
        status: "submitted",
      },
      error: null,
    });

    await expect(
      submitOwnerOpeningBalanceCorrectionAction({}, correctionForm()),
    ).resolves.toMatchObject({
      errorCode: "unexpected_response",
      status: "error",
    });
  });

  it.each([
    ["initial", [entryId, replacementId]],
    ["correction", [reversalId, reversalId]],
  ])(
    "rejects invalid approved %s entry cardinality or identity",
    async (requestKind, entryIds) => {
      mocks.from.mockReturnValue(requestKindQuery(requestKind));
      mocks.rpc.mockResolvedValue({
        data: { entry_ids: entryIds, request_id: requestId, status: "approved" },
        error: null,
      });

      await expect(
        reviewOwnerOpeningBalanceAction({}, reviewForm("approve")),
      ).resolves.toMatchObject({
        errorCode: "unexpected_response",
        status: "error",
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("rejects a rejection result that contains an entry", async () => {
    mocks.rpc.mockResolvedValue({
      data: { entry_ids: [entryId], request_id: requestId, status: "rejected" },
      error: null,
    });
    const form = reviewForm("reject");
    form.set("reviewReason", "Evidence needs reconciliation");

    await expect(reviewOwnerOpeningBalanceAction({}, form)).resolves.toMatchObject({
      errorCode: "unexpected_response",
      status: "error",
    });
  });

  it.each([
    ["28000", "Not authenticated", "authentication"],
    ["42501", "Not authorized", "authorization"],
    ["22023", "Financial month is locked", "financial_month_locked"],
    ["23514", "owner_share_total_not_100", "ownership_roster"],
    ["23503", "Opening evidence document not found", "evidence"],
    ["22023", "Owner opening correction target is stale", "stale_target"],
    ["22023", "Idempotency key conflicts with another payload", "idempotency_conflict"],
  ] as const)("maps %s %s to %s", async (code, message, errorCode) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message } });

    await expect(
      submitOwnerOpeningBalanceAction({}, initialForm()),
    ).resolves.toMatchObject({ errorCode, status: "error" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

function initialForm() {
  const form = new FormData();
  form.set("propertyId", propertyId);
  form.set("ownerPersonId", ownerPersonId);
  form.set("currency", "USD");
  form.set("effectiveDate", "2026-08-01");
  form.set("component", "ips_held_owner_cash");
  form.set("amount", "10");
  form.set("reason", "Reconciled opening evidence");
  form.set("sourceReference", "IPS opening workbook row 8");
  form.set("supportingDocumentId", "");
  form.set("evidenceSha256", hash);
  form.set("resubmissionOfRequestId", "");
  form.set("idempotencyKey", "initial-request-key");
  return form;
}

function correctionForm() {
  const form = new FormData();
  form.set("entryId", entryId);
  form.set("replacementAmount", "12.34");
  form.set("reason", "Correct reconciled opening");
  form.set("sourceReference", "IPS corrected workbook row 8");
  form.set("supportingDocumentId", "");
  form.set("evidenceSha256", hash);
  form.set("resubmissionOfRequestId", "");
  form.set("idempotencyKey", "correction-request-key");
  return form;
}

function reviewForm(decision: "approve" | "reject") {
  const form = new FormData();
  form.set("requestId", requestId);
  form.set("decision", decision);
  form.set("reviewReason", "");
  form.set("idempotencyKey", "review-request-key");
  return form;
}

function requestKindQuery(requestKind: string) {
  const result = { data: { request_kind: requestKind }, error: null };
  const builder = {
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => result),
  };
  return builder;
}

function documentLookup(data: Record<string, unknown> | null) {
  const result = { data, error: null };
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => builder),
  };
  return builder;
}
