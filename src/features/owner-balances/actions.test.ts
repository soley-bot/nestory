import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireCorrection: vi.fn(),
  requireReview: vi.fn(),
  requireSubmission: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
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
  })),
}));

import {
  reviewOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceCorrectionAction,
} from "@/features/owner-balances/actions";

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

describe("owner opening balance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubmission.mockResolvedValue({
      organizationId,
      userId: "00000000-0000-4000-8000-000000000010",
    });
    mocks.requireCorrection.mockResolvedValue({ organizationId });
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
