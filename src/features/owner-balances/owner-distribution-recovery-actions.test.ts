import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn(), reads: [] as unknown[] }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceCorrectionContext: mocks.context }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { previewOwnerDistributionRecoveryAction as preview, confirmOwnerDistributionRecoveryAction as confirm } from "./owner-distribution-recovery-actions";
const withdrawalId = "00000000-0000-4000-8000-000000000001";
const allocationId = "00000000-0000-4000-8000-000000000002";
const propertyId = "00000000-0000-4000-8000-000000000003";
const otherId = "00000000-0000-4000-8000-000000000004";
const values = { withdrawalId, allocationId, distributionDate: "2026-08-31", feePaymentDate: "2026-09-04", reason: "Actual bank dates confirmed", previewHash: "a".repeat(64), idempotencyKey: "recovery-confirm-001" };
const receipt = { allocationId, withdrawalId, oldDate: "2026-08-06", newDate: values.feePaymentDate, oldDistributionDate: "2026-09-15", newDistributionDate: values.distributionDate, amount: 40, distributionAmount: 454.4, currentBalanceChange: 0, previewHash: values.previewHash, canApply: true, blockers: [] };
const lines = [{ id: "line", recognized_on: "2026-09-01" }];
const allocations = [{ id: allocationId, owner_invoice_line_id: "line", allocation_date: "2026-08-06" }];
function form(overrides: Record<string, string | undefined> = {}) { const data = new FormData(); Object.entries({ ...values, ...overrides }).forEach(([key, value]) => { if (value !== undefined) data.set(key, value); }); return data; }
function goodReads() { mocks.reads = [{ data: { id: withdrawalId, property_id: propertyId, reversal_of_id: null } }, { data: lines }, { data: allocations }, { data: [] }]; }
describe("owner distribution recovery actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.context.mockResolvedValue({ organizationId: "org" }); goodReads(); mocks.rpc.mockResolvedValue({ data: receipt });
    mocks.from.mockImplementation(() => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "is", "gt"]) query[method] = vi.fn(() => query);
      query.limit = vi.fn(async () => mocks.reads.shift()); query.maybeSingle = vi.fn(async () => mocks.reads.shift()); return query;
    });
  });
  it("previews exactly one unreversed early fee and does not save", async () => {
    expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "success", preview: receipt });
    expect(mocks.rpc).toHaveBeenCalledWith("preview_owner_distribution_fee_recovery", { p_organization_id: "org", p_allocation_id: allocationId, p_payment_date: values.feePaymentDate, p_withdrawal_id: withdrawalId, p_distribution_date: values.distributionDate });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])("fails safely if scoped read %s fails", async index => {
    mocks.reads[index] = { data: null, error: { message: "denied" } };
    expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "error" }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refuses ambiguous active fee payments", async () => {
    mocks.reads[2] = { data: [...allocations, { ...allocations[0], id: otherId }] };
    expect((await preview({ status: "idle" }, form())).message).toContain("Several"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("excludes reversed payments before deciding ambiguity", async () => {
    mocks.reads[2] = { data: [...allocations, { ...allocations[0], id: otherId }] }; mocks.reads[3] = { data: [{ reversal_of_id: otherId }] };
    expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "success" });
  });
  it("excludes payments on or after recognition", async () => {
    mocks.reads[2] = { data: [{ ...allocations[0], allocation_date: "2026-09-01" }] };
    expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "error" }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not silently choose from truncated source lists", async () => {
    mocks.reads[1] = { data: Array.from({ length: 501 }, () => lines[0]) };
    expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "error" }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{}, { ...receipt, allocationId: otherId }, { ...receipt, newDate: "2026-09-03" }, { ...receipt, withdrawalId: otherId }, { ...receipt, newDistributionDate: "2026-08-30" }])("rejects malformed or mismatched preview %j", async data => {
    mocks.rpc.mockResolvedValue({ data }); expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "error" });
  });
  it("returns blocked preview with actionable message", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...receipt, canApply: false, blockers: ["insufficient_authoritative_held_cash"] } });
    expect(await preview({ status: "idle" }, form())).toMatchObject({ status: "error", message: expect.stringContaining("owner cash"), preview: { canApply: false } });
  });
  it("confirms with fresh authority and uses database property for invalidation", async () => {
    mocks.rpc.mockResolvedValue({ data: { correctionId: otherId } });
    expect(await confirm({ status: "idle" }, form({ propertyId: otherId }))).toMatchObject({ status: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith("recover_owner_distribution_fee_dates", expect.objectContaining({ p_allocation_id: allocationId, p_preview_hash: values.previewHash, p_idempotency_key: values.idempotencyKey }));
    expect(mocks.revalidate).toHaveBeenCalledWith(`/properties/${propertyId}`, "layout");
  });
  it("does not save if confirmation cannot read the distribution", async () => {
    mocks.reads[0] = { data: null, error: { message: "denied" } }; expect(await confirm({ status: "idle" }, form())).toMatchObject({ status: "error" }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{}, { correctionId: "invalid" }])("does not claim success with malformed confirmation %j", async data => {
    mocks.rpc.mockResolvedValue({ data }); expect(await confirm({ status: "idle" }, form())).toMatchObject({ status: "error" }); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([["preview_stale", "preview"], ["month_locked", "closed"], ["privileged_email_step_up_required", "Verify"], ["forbidden", "permission"]])("explains confirmation error %s", async (message, expected) => {
    mocks.rpc.mockResolvedValue({ error: { message } }); expect((await confirm({ status: "idle" }, form())).message).toContain(expected);
  });
  it.each([preview, confirm])("propagates authorization failure before any database access", async action => {
    mocks.context.mockRejectedValue(new Error("Forbidden")); await expect(action({ status: "idle" }, form())).rejects.toThrow("Forbidden"); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ distributionDate: "2026-02-30" }, { feePaymentDate: "oops" }, { withdrawalId: "bad" }])("rejects invalid dates or identity %j", async override => {
    expect(await preview({ status: "idle" }, form(override))).toMatchObject({ status: "error" }); expect(mocks.from).not.toHaveBeenCalled();
  });
});
