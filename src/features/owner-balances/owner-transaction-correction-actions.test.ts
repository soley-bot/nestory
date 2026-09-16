import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceCorrectionContext: mocks.context }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
import { correctOwnerTransactionAction } from "./owner-transaction-correction-actions";
const originalId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const replacementId = "00000000-0000-4000-8000-000000000003";
const reversalId = "00000000-0000-4000-8000-000000000004";
const values = { kind: "distribution", originalId, propertyId, date: "2026-09-01", amount: "123.4", reference: "August payout", reason: "Correct bank payment amount", idempotencyKey: "correction-test-0001" };
const receipt = { originalId, replacementId, reversalId, oldDate: "2026-09-02", newDate: values.date, oldAmount: "120.00", newAmount: "123.40", reference: values.reference };
function form(overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  Object.entries({ ...values, ...overrides }).forEach(([key, value]) => { if (value !== undefined) data.set(key, value); });
  return data;
}
describe("owner transaction correction action", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ organizationId: "org" }); mocks.rpc.mockResolvedValue({ data: receipt, error: null }); });
  it.each(["distribution", "contribution"])("sends %s correction through its audited command", async kind => {
    expect(await correctOwnerTransactionAction({ status: "idle" }, form({ kind }))).toMatchObject({ status: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith(`correct_owner_${kind}`, expect.objectContaining({ p_organization_id: "org", p_amount: "123.40", p_reference: values.reference, p_reason: values.reason, p_idempotency_key: values.idempotencyKey }));
    expect(mocks.revalidate).toHaveBeenCalledWith(`/properties/${propertyId}`, "layout");
  });
  it.each([{ amount: "0" }, { amount: "-1" }, { amount: "1.001" }, { amount: "1e3" }, { date: "2026-02-30" }, { reason: "short" }, { kind: "rent" }, { originalId: "wrong" }])("rejects invalid fields before accessing the database: %j", async override => {
    expect(await correctOwnerTransactionAction({ status: "idle" }, form(override))).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{}, { ...receipt, originalId: propertyId }, { ...receipt, newAmount: "1.00" }, { ...receipt, newDate: "2026-09-02" }, { ...receipt, reference: "another" }])("does not claim success with a mismatched receipt", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await correctOwnerTransactionAction({ status: "idle" }, form())).toMatchObject({ status: "error" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("preserves authorization errors without writing", async () => {
    mocks.context.mockRejectedValue(new Error("Forbidden"));
    await expect(correctOwnerTransactionAction({ status: "idle" }, form())).rejects.toThrow("Forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["owner_period_closed", "closed"], ["already_reversed", "already"], ["would_underfund_owner_cash", "cash"], ["privileged_email_step_up_required", "Verify your email"]])("explains %s", async (code, message) => {
    mocks.rpc.mockResolvedValue({ error: { message: code } });
    expect((await correctOwnerTransactionAction({ status: "idle" }, form())).message).toContain(message);
  });
});
