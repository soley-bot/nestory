import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateDepositRequirementAction } from "./deposit-requirement-actions";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requirePermission: vi.fn(), client: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ leaseId: id(1), expectedDepositId: id(2),
    expectedAmount: "1000.00", amount: "1500.50", reason: "Agreed updated lease deposit", idempotencyKey: id(3), ...changes })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({ organizationId: id(4) });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: id(1), error: null });
});
describe("update required deposit", () => {
  it("changes only the agreed amount using session scope and the checked snapshot", async () => {
    const data = form({ organizationId: id(9), monthlyRentAmount: "3000" });
    expect(await updateDepositRequirementAction({}, data)).toMatchObject({ status: "success" });
    expect(mocks.requirePermission).toHaveBeenCalledWith("leases.change_terms");
    expect(mocks.client).toHaveBeenCalledWith(data);
    expect(mocks.rpc).toHaveBeenCalledWith("update_lease_deposit_requirement", {
      p_organization_id: id(4), p_lease_id: id(1), p_amount: 1500.5,
      p_expected_amount: 1000, p_expected_deposit_id: id(2),
      p_reason: "Agreed updated lease deposit", p_idempotency_key: id(3),
    });
  });
  it("allows zero and a lease without an existing deposit", async () => {
    expect(await updateDepositRequirementAction({}, form({ amount: "0", expectedAmount: "0", expectedDepositId: "" }))).toMatchObject({ status: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_lease_deposit_requirement", expect.objectContaining({ p_amount: 0, p_expected_deposit_id: undefined }));
  });
  it.each(["", "-1", "NaN", "Infinity", "1.001", "1e3", "1000000000000"])("rejects invalid amount %s before any write", async amount => {
    expect(await updateDepositRequirementAction({}, form({ amount }))).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("enforces authorization before reaching the command", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Forbidden"));
    await expect(updateDepositRequirementAction({}, form())).rejects.toThrow("Forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["deposit_requirement_below_held", "Record any agreed refund first"],
    ["deposit_requirement_busy", "Try saving again"],
    ["deposit_requirement_changed", "refresh the lease"],
    ["deposit_requirement_legacy_evidence", "historical records"],
  ])("explains the %s rejection", async (message, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await updateDepositRequirementAction({}, form())).toMatchObject({ status: "error", message: expect.stringContaining(expected) });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not claim a save without a matching result", async () => {
    mocks.rpc.mockResolvedValue({ data: id(9), error: null });
    expect(await updateDepositRequirementAction({}, form())).toMatchObject({ status: "error" });
  });
});
