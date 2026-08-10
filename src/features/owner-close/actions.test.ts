import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPdf: vi.fn(() => new Uint8Array([1, 2, 3])),
  buildXlsx: vi.fn(() => new Uint8Array([4, 5])),
  download: vi.fn(),
  from: vi.fn(),
  loadPublication: vi.fn(),
  requireClose: vi.fn(),
  requirePublication: vi.fn(),
  requireReopen: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireOwnerCloseContext: mocks.requireClose,
  requireOwnerMonthReopenContext: mocks.requireReopen,
  requireOwnerStatementPublicationContext: mocks.requirePublication,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    storage: { from: mocks.from },
  })),
}));
vi.mock("@/features/reports/data/owner-statement-report", () => ({
  loadOwnerStatementPublication: mocks.loadPublication,
}));
vi.mock("@/features/reports/data/pdf", () => ({
  buildOwnerStatementPdf: mocks.buildPdf,
}));
vi.mock("@/features/reports/data/excel", () => ({
  buildOwnerStatementXlsx: mocks.buildXlsx,
}));

import {
  closeOwnerMonthAction,
  publishOwnerStatementAction,
  recordOwnerCloseCorrectionAction,
  reopenOwnerMonthAction,
} from "@/features/owner-close/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const seriesId = "00000000-0000-4000-8000-000000000004";
const revisionId = "00000000-0000-4000-8000-000000000005";
const publicationId = "00000000-0000-4000-8000-000000000006";

describe("owner close checked actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClose.mockResolvedValue({ organizationId });
    mocks.requirePublication.mockResolvedValue({ organizationId });
    mocks.requireReopen.mockResolvedValue({ organizationId });
    mocks.from.mockReturnValue({
      download: mocks.download,
      remove: mocks.remove,
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({ data: {}, error: null });
    mocks.remove.mockResolvedValue({ data: {}, error: null });
    mocks.loadPublication.mockResolvedValue({
      publicationId,
      statementNumber: "OS-202608-000000000000",
    });
    mocks.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });
  });

  it("closes one exact scope through Super Admin close authority", async () => {
    await closeOwnerMonthAction(form({
      closeReason: "Reviewed against the August bank reconciliation",
      currency: "USD",
      idempotencyKey: "owner-close-august-r1",
      monthStart: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    }));

    expect(mocks.requireClose).toHaveBeenCalledOnce();
    expect(mocks.requireReopen).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("close_owner_month", {
      p_close_reason: "Reviewed against the August bank reconciliation",
      p_currency: "USD",
      p_idempotency_key: "owner-close-august-r1",
      p_month_start: "2026-08-01",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
  });

  it("reopens the immutable revision through distinct Super Admin authority", async () => {
    await reopenOwnerMonthAction(form({
      idempotencyKey: "owner-reopen-august-r2",
      reopenReason: "Late paid cost belongs to the locked August owner month",
      seriesId,
    }));

    expect(mocks.requireReopen).toHaveBeenCalledOnce();
    expect(mocks.requireClose).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("reopen_owner_month", {
      p_idempotency_key: "owner-reopen-august-r2",
      p_organization_id: organizationId,
      p_owner_close_series_id: seriesId,
      p_reopen_reason: "Late paid cost belongs to the locked August owner month",
    });
  });

  it("preserves a signed exact decimal and evidence on the checked correction", async () => {
    await recordOwnerCloseCorrectionAction(form({
      component: "ips_held_owner_cash",
      effectiveDate: "2026-08-31",
      evidenceSha256: "a".repeat(64),
      idempotencyKey: "owner-close-correction-august-r2",
      reason: "Record bank charge discovered after revision one",
      revisionId,
      signedAmount: "-900719925474.09",
      sourceReference: "BANK-ADVICE-2026-08-31-001",
    }));

    expect(mocks.requireReopen).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("record_owner_close_correction", {
      p_component: "ips_held_owner_cash",
      p_effective_date: "2026-08-31",
      p_evidence_sha256: "a".repeat(64),
      p_idempotency_key: "owner-close-correction-august-r2",
      p_organization_id: organizationId,
      p_owner_close_revision_id: revisionId,
      p_reason: "Record bank charge discovered after revision one",
      p_signed_amount: "-900719925474.09",
      p_source_reference: "BANK-ADVICE-2026-08-31-001",
    });
  });

  it("publishes, uploads create-only deterministic artifacts, and registers exact hashes", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          publication_id: publicationId,
          statement_number: "OS-202608-000000000000",
        },
        error: null,
      })
      .mockResolvedValue({ data: { status: "registered" }, error: null });

    await publishOwnerStatementAction(form({
      idempotencyKey: "owner-statement-august-r1",
      revisionId,
    }));

    expect(mocks.requirePublication).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "publish_owner_statement", {
      p_idempotency_key: "owner-statement-august-r1",
      p_organization_id: organizationId,
      p_owner_close_revision_id: revisionId,
    });
    expect(mocks.from).toHaveBeenCalledWith("owner-statements");
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0]?.[2]).toMatchObject({ upsert: false });
    expect(mocks.upload.mock.calls[1]?.[2]).toMatchObject({ upsert: false });
    expect(mocks.rpc.mock.calls.slice(1).map((call) => call[0])).toEqual([
      "register_owner_statement_artifact",
      "register_owner_statement_artifact",
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
  });

  it("retries a partial publication without replacing its retained first artifact", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "publish_owner_statement"
        ? { publication_id: publicationId, statement_number: "OS-202608-000000000000" }
        : { status: "registered" },
      error: null,
    }));
    mocks.upload
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "temporary storage failure" } })
      .mockResolvedValueOnce({ data: null, error: { message: "The resource already exists", statusCode: "409" } })
      .mockResolvedValueOnce({ data: {}, error: null });
    mocks.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }),
      error: null,
    });
    const command = form({
      idempotencyKey: "owner-statement-august-partial-r1",
      revisionId,
    });

    await expect(publishOwnerStatementAction(command)).rejects.toThrow("upload failed");
    await publishOwnerStatementAction(command);

    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls.every((call) => call[2]?.upsert === false)).toBe(true);
    expect(mocks.rpc.mock.calls.filter((call) =>
      call[0] === "register_owner_statement_artifact"
    )).toHaveLength(3);
  });

  it("refuses a replay when existing Storage bytes differ from the frozen renderer", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { publication_id: publicationId, statement_number: "OS-202608-000000000000" },
      error: null,
    });
    mocks.upload.mockResolvedValueOnce({
      data: null,
      error: { message: "The resource already exists", statusCode: "409" },
    });
    mocks.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array([9, 9, 9])], { type: "application/pdf" }),
      error: null,
    });

    await expect(publishOwnerStatementAction(form({
      idempotencyKey: "owner-statement-august-conflicting-r1",
      revisionId,
    }))).rejects.toThrow("do not match");

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects rounded, zero, and noncanonical corrections before authority", async () => {
    for (const signedAmount of ["1.001", "0", "1e3"]) {
      await expect(recordOwnerCloseCorrectionAction(form({
        component: "ips_due_to_owner",
        effectiveDate: "2026-08-31",
        evidenceSha256: "b".repeat(64),
        idempotencyKey: "owner-close-correction-invalid",
        reason: "Invalid amount must never reach the database",
        revisionId,
        signedAmount,
        sourceReference: "BANK-ADVICE-INVALID",
      }))).rejects.toThrow();
    }

    expect(mocks.requireReopen).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
