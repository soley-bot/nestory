import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ operation: vi.fn(), correction: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceOperationContext: mocks.operation, requireFinanceCorrectionContext: mocks.correction }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
import { recordOwnerContributionAction, correctOwnerDistributionDateAction } from "./owner-cash-actions";
const propertyId = "00000000-0000-4000-8000-000000000001";
const ownerPersonId = "00000000-0000-4000-8000-000000000002";
const withdrawalId = "00000000-0000-4000-8000-000000000003";
const idle = { status: "idle" as const };
const values = { propertyId, ownerPersonId, withdrawalId, currency: "USD", amount: "123.4", eventDate: "2026-09-12", distributionDate: "2026-09-13", reason: "Date entered incorrectly", idempotencyKey: "owner-cash-test-0001" };
function form(overrides: Record<string, string> = {}) { const data = new FormData(); Object.entries({ ...values, ...overrides }).forEach(([key, value]) => data.set(key, value)); return data; }
describe("owner cash commands", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.operation.mockResolvedValue({ organizationId: "org" }); mocks.correction.mockResolvedValue({ organizationId: "org" }); mocks.rpc.mockResolvedValue({ data: { withdrawalId, reversalId: ownerPersonId, oldDate: "2026-09-12", newDate: values.distributionDate }, error: null }); });
  it("records exact contribution with server organization and selected scope", async () => {
    expect(await recordOwnerContributionAction(idle, form())).toMatchObject({ status: "success" });
    expect(mocks.operation).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("record_owner_contribution", { p_amount: "123.40", p_currency: "USD", p_event_date: values.eventDate, p_unit_id: undefined, p_idempotency_key: values.idempotencyKey, p_organization_id: "org", p_owner_person_id: ownerPersonId, p_property_id: propertyId, p_reason: values.reason });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/properties/${propertyId}`, "layout");
  });
  it.each(["2026-02-30", "2026-13-01", "2025-02-29", "no-date"])("rejects invalid real date %s before RPC", async date => {
    expect(await recordOwnerContributionAction(idle, form({ eventDate: date }))).toMatchObject({ status: "error" });
    expect(await correctOwnerDistributionDateAction(idle, form({ distributionDate: date }))).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.001", "1e2"])("rejects invalid contribution amount %s", async amount => { expect(await recordOwnerContributionAction(idle, form({ amount }))).toMatchObject({ status: "error" }); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("corrects through the single audited command", async () => {
    expect(await correctOwnerDistributionDateAction(idle, form())).toMatchObject({ status: "success" });
    expect(mocks.correction).toHaveBeenCalledOnce();
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("correct_owner_distribution_date", { p_organization_id: "org", p_withdrawal_id: withdrawalId, p_distribution_date: values.distributionDate, p_reason: values.reason, p_idempotency_key: values.idempotencyKey });
  });
  it("does not claim success for a malformed correction receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    expect(await correctOwnerDistributionDateAction(idle, form())).toMatchObject({ status: "error" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([["already_reversed", "already been reversed"], ["financial_month_locked", "closed"], ["date_unchanged", "different"], ["privileged_email_step_up_required", "Verify your email"]])("explains command error %s", async (code, text) => {
    mocks.rpc.mockResolvedValue({ error: { message: code } });
    expect((await correctOwnerDistributionDateAction(idle, form())).message).toContain(text);
  });
  it("does not write after permission rejection", async () => {
    mocks.correction.mockRejectedValue(new Error("Forbidden")); mocks.operation.mockRejectedValue(new Error("Forbidden"));
    await expect(correctOwnerDistributionDateAction(idle, form())).rejects.toThrow("Forbidden");
    await expect(recordOwnerContributionAction(idle, form())).rejects.toThrow("Forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps database failures readable without exposing internal details", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "private SQL internals" } });
    const result = await correctOwnerDistributionDateAction(idle, form());
    expect(result.status).toBe("error"); expect(result.message).not.toContain("private SQL"); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
