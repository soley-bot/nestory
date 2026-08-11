import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  commitIpsCutoverBatchAction,
  stageIpsCutoverBatchAction,
} from "./cutover-actions";

describe("IPS cutover actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000101",
    });
  });

  it("stages the exact redacted manifest through the checked RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        batch_id: "10000000-0000-4000-8000-000000000001",
        manifest_sha256: "a".repeat(64),
        status: "staged",
      },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc });
    const manifest = {
      authorityStartDate: "2026-09-01",
      dataOwner: "REDACTED-IPS-DATA-OWNER",
      importRuns: [],
      ownerOpeningComponents: [],
      schemaVersion: 1,
      signedExceptions: [],
      tenantOpeningBalances: [],
    };
    const formData = new FormData();
    formData.set("authorityStartDate", "2026-09-01");
    formData.set("dataOwner", "REDACTED-IPS-DATA-OWNER");
    formData.set("idempotencyKey", "cutover-stage-v1");
    formData.set("manifest", JSON.stringify(manifest));

    const result = await stageIpsCutoverBatchAction({}, formData);

    expect(rpc).toHaveBeenCalledWith("stage_ips_cutover_batch", {
      p_authority_start_date: "2026-09-01",
      p_data_owner: "REDACTED-IPS-DATA-OWNER",
      p_idempotency_key: "cutover-stage-v1",
      p_manifest: manifest,
      p_organization_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(result).toMatchObject({
      batchId: "10000000-0000-4000-8000-000000000001",
      manifestSha256: "a".repeat(64),
      status: "success",
    });
  });

  it("rejects malformed manifests before opening an authenticated context", async () => {
    const formData = new FormData();
    formData.set("authorityStartDate", "2026-09-01");
    formData.set("dataOwner", "REDACTED-IPS-DATA-OWNER");
    formData.set("idempotencyKey", "cutover-stage-v1");
    formData.set("manifest", "{not-json");

    const result = await stageIpsCutoverBatchAction({}, formData);

    expect(result).toEqual({
      message: "Upload a valid IPS cutover manifest.",
      status: "error",
    });
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it("commits one staged batch with explicit sign-off through the checked RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        batch_id: "10000000-0000-4000-8000-000000000001",
        reconciliation_id: "20000000-0000-4000-8000-000000000001",
        status: "reconciled",
      },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc });
    const formData = new FormData();
    formData.set("batchId", "10000000-0000-4000-8000-000000000001");
    formData.set("idempotencyKey", "cutover-commit-v1");
    formData.set("signoffReason", "Redacted source totals independently checked");

    const result = await commitIpsCutoverBatchAction({}, formData);

    expect(rpc).toHaveBeenCalledWith("commit_ips_cutover_batch", {
      p_batch_id: "10000000-0000-4000-8000-000000000001",
      p_idempotency_key: "cutover-commit-v1",
      p_organization_id: "00000000-0000-4000-8000-000000000001",
      p_signoff_reason: "Redacted source totals independently checked",
    });
    expect(result).toMatchObject({
      batchId: "10000000-0000-4000-8000-000000000001",
      reconciliationId: "20000000-0000-4000-8000-000000000001",
      status: "success",
    });
  });
});
