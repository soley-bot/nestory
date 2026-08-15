import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDownload: vi.fn(),
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  buildPdf: vi.fn(() => new Uint8Array([1, 2, 3])),
  buildXlsx: vi.fn(() => new Uint8Array([4, 5])),
  download: vi.fn(),
  from: vi.fn(),
  loadPresentation: vi.fn(),
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
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: mocks.adminRpc,
    storage: { from: mocks.adminFrom },
  })),
}));
vi.mock("@/features/reports/data/owner-statement-report", () => ({
  loadOwnerStatementPublication: mocks.loadPublication,
}));
vi.mock("@/features/reports/data/owner-statement-presentation", () => ({
  loadOwnerStatementPresentation: mocks.loadPresentation,
}));
vi.mock("@/features/reports/data/pdf", () => ({
  buildOwnerStatementPdf: mocks.buildPdf,
}));
vi.mock("@/features/reports/data/excel", () => ({
  buildOwnerStatementXlsx: mocks.buildXlsx,
}));

import * as ownerCloseActions from "@/features/owner-close/actions";
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
const actorId = "00000000-0000-4000-8000-000000000007";

describe("owner close checked actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClose.mockResolvedValue({ organizationId });
    mocks.requirePublication.mockResolvedValue({ organizationId, userId: actorId });
    mocks.requireReopen.mockResolvedValue({ organizationId });
    mocks.from.mockReturnValue({
      download: mocks.download,
      remove: mocks.remove,
      upload: mocks.upload,
    });
    mocks.adminFrom.mockReturnValue({ download: mocks.adminDownload });
    mocks.adminDownload.mockImplementation(async (path: string) => ({
      data: new Blob(
        [path.endsWith(".pdf") ? new Uint8Array([1, 2, 3]) : new Uint8Array([4, 5])],
      ),
      error: null,
    }));
    mocks.adminRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data: name === "get_owner_statement_artifact_object"
        ? {
            content_type: args.p_format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            metadata_size_bytes: args.p_format === "pdf" ? 3 : 2,
            storage_object_id: args.p_format === "pdf"
              ? "00000000-0000-4000-8000-000000000008"
              : "00000000-0000-4000-8000-000000000009",
            storage_object_version: `${args.p_format}-version-1`,
          }
        : { status: "registered" },
      error: null,
    }));
    mocks.upload.mockResolvedValue({ data: {}, error: null });
    mocks.remove.mockResolvedValue({ data: {}, error: null });
    mocks.loadPublication.mockResolvedValue({
      artifacts: [],
      publicationId,
      statementNumber: "OS-202608-000000000000",
    });
    mocks.loadPresentation.mockResolvedValue({
      organizationName: "Independent Property Service",
      ownerName: "Sokha Vannak",
      propertyLabel: "CTR-RES / Central Residence",
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
    expect(mocks.buildPdf).toHaveBeenCalledWith(
      expect.objectContaining({ publicationId }),
      {
        organizationName: "Independent Property Service",
        ownerName: "Sokha Vannak",
        propertyLabel: "CTR-RES / Central Residence",
      },
    );
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0]?.[2]).toMatchObject({ upsert: false });
    expect(mocks.upload.mock.calls[1]?.[2]).toMatchObject({ upsert: false });
    expect(mocks.rpc.mock.calls.slice(1).map((call) => call[0])).not.toContain(
      "register_owner_statement_artifact",
    );
    expect(mocks.adminRpc.mock.calls.map((call) => call[0])).toEqual([
      "get_owner_statement_artifact_object",
      "register_owner_statement_artifact_verified",
      "get_owner_statement_artifact_object",
      "register_owner_statement_artifact_verified",
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
  });

  it("resumes an incomplete publication from a fresh key and publication identity", async () => {
    const resume = (
      ownerCloseActions as Record<string, unknown>
    ).resumeOwnerStatementPublicationAction;
    expect(resume).toBeTypeOf("function");
    if (typeof resume !== "function") return;

    mocks.rpc.mockResolvedValueOnce({
      data: {
        publication_id: publicationId,
        statement_number: "OS-202608-000000000000",
      },
      error: null,
    });
    await (resume as (formData: FormData) => Promise<void>)(form({
      idempotencyKey: "fresh-resume-key-after-reload",
      publicationId,
    }));

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "resume_owner_statement_publication", {
      p_idempotency_key: "fresh-resume-key-after-reload",
      p_organization_id: organizationId,
      p_publication_id: publicationId,
    });
    expect(mocks.adminRpc.mock.calls.filter((call) =>
      call[0] === "register_owner_statement_artifact_verified"
    )).toHaveLength(2);
  });

  it("derives distinct stable artifact claims from full long keys", async () => {
    const firstPublicationId = "00000000-0000-4000-8000-000000000016";
    const secondPublicationId = "00000000-0000-4000-8000-000000000026";
    const prefix = "k".repeat(159);
    const calls = [
      { id: firstPublicationId, key: `${prefix}a` },
      { id: secondPublicationId, key: `${prefix}b` },
    ];
    for (const item of calls) {
      mocks.rpc.mockResolvedValueOnce({
        data: {
          publication_id: item.id,
          statement_number: "OS-202608-000000000000",
        },
        error: null,
      });
      mocks.loadPublication.mockResolvedValueOnce({
        artifacts: [],
        publicationId: item.id,
        statementNumber: "OS-202608-000000000000",
      });
      await publishOwnerStatementAction(form({
        idempotencyKey: item.key,
        revisionId,
      }));
    }

    const registrationKeys = mocks.adminRpc.mock.calls
      .filter((call) => call[0] === "register_owner_statement_artifact_verified")
      .map((call) => call[1].p_idempotency_key);
    expect(new Set(registrationKeys).size).toBe(4);
    expect(registrationKeys.every((key) => key.length <= 160)).toBe(true);
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
      .mockResolvedValueOnce({ data: {}, error: null });
    mocks.loadPublication
      .mockResolvedValueOnce({
        artifacts: [], publicationId, statementNumber: "OS-202608-000000000000",
      })
      .mockResolvedValueOnce({
        artifacts: [{ format: "pdf" }], publicationId,
        statementNumber: "OS-202608-000000000000",
      });
    const command = form({
      idempotencyKey: "owner-statement-august-partial-r1",
      revisionId,
    });

    await expect(publishOwnerStatementAction(command)).rejects.toThrow("upload failed");
    await publishOwnerStatementAction(command);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload.mock.calls.every((call) => call[2]?.upsert === false)).toBe(true);
    expect(mocks.adminRpc.mock.calls.filter((call) =>
      call[0] === "register_owner_statement_artifact_verified"
    )).toHaveLength(2);
  });

  it("retains a newly uploaded object when registration has an ambiguous failure", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { publication_id: publicationId, statement_number: "OS-202608-000000000000" },
      error: null,
    });
    mocks.adminRpc
      .mockImplementationOnce(async (_name: string, args: Record<string, unknown>) => ({
        data: {
          content_type: "application/pdf",
          metadata_size_bytes: 3,
          storage_object_id: "00000000-0000-4000-8000-000000000008",
          storage_object_version: `${args.p_format}-version-1`,
        },
        error: null,
      }))
      .mockResolvedValueOnce({
        data: null,
        error: { message: "ambiguous registration response" },
      });

    await expect(publishOwnerStatementAction(form({
      idempotencyKey: "owner-statement-ambiguous-registration",
      revisionId,
    }))).rejects.toThrow("ambiguous registration response");

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
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
