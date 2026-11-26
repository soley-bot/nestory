import { beforeEach, describe, expect, it, vi } from "vitest";
import { FINANCIAL_GENERATION_FIELD } from "@/lib/finance/financial-write-context";
import { PILOT_RESET_ORGANIZATION } from "@/features/reset-maintenance/review";

const { context, financial, stepUp, createClient, rpc, serviceRpc } = vi.hoisted(() => ({
  context: vi.fn(), financial: vi.fn(), stepUp: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), serviceRpc: vi.fn(),
}));
vi.mock("./pilot-rent-posting-context", () => ({ requirePilotRentPostingContext: context }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ getFinancialWriteContext: financial }));
vi.mock("@/lib/auth/privileged-step-up-guard", () => ({ requirePrivilegedStepUp: stepUp }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: createClient }));
import { setPilotRentAutoPostingAction } from "./pilot-rent-posting-actions";

const updatedAt = "2026-11-25T12:00:00+00:00";
function form(enabled = "true") {
  const value = new FormData();
  value.set("enabled", enabled); value.set("expectedUpdatedAt", updatedAt);
  value.set(FINANCIAL_GENERATION_FIELD, "1");
  return value;
}
const submit = (value = form()) => setPilotRentAutoPostingAction({ kind: "idle" }, value);
beforeEach(() => {
  vi.resetAllMocks();
  context.mockResolvedValue({ organizationId: PILOT_RESET_ORGANIZATION, userId: "10000000-0000-4000-8000-000000000001" });
  financial.mockResolvedValue({ generation: 1, status: "open", enforced: true, financial_start_date: "2026-10-01", automatic_rent_enabled: false, automatic_rent_updated_at: updatedAt });
  createClient.mockResolvedValue({ rpc }); stepUp.mockResolvedValue({ rpc: serviceRpc });
  rpc.mockResolvedValue({ data: true, error: null });
});
describe("Pilot automatic rent posting action", () => {
  it("requires the actual Pilot administrator independently of page rendering", async () => {
    context.mockRejectedValue(Error("not found"));
    await expect(submit()).rejects.toThrow("not found");
    expect(createClient).not.toHaveBeenCalled();
  });
  it("uses the captured generation and verified session to confirm the saved boolean", async () => {
    const value = form(); value.set("$ACTION_REF_0", "framework");
    expect(await submit(value)).toMatchObject({ kind: "confirmed", enabled: true });
    expect(createClient).toHaveBeenCalledWith(value);
    expect(stepUp).toHaveBeenCalledWith(expect.objectContaining({ organizationId: PILOT_RESET_ORGANIZATION }), { rpc });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_pilot_rent_auto_posting", {
      p_organization_id: PILOT_RESET_ORGANIZATION, p_enabled: true, p_expected_updated_at: updatedAt,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
  it("rejects duplicate, foreign, stale and unavailable input before mutation", async () => {
    const duplicate = form(); duplicate.append("enabled", "false");
    const foreign = form(); foreign.set("organizationId", "foreign");
    const stale = form(); stale.set(FINANCIAL_GENERATION_FIELD, "0");
    for (const value of [duplicate, foreign, stale]) expect((await submit(value)).kind).toBe("invalid");
    financial.mockResolvedValueOnce({ generation: 1, status: "frozen", enforced: true, financial_start_date: "2026-10-01" });
    expect((await submit()).kind).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves step-up redirects and gives safe conflict and unknown-result messages", async () => {
    stepUp.mockRejectedValueOnce(Error("Privileged email verification required."));
    expect((await submit()).kind).toBe("invalid");
    stepUp.mockRejectedValueOnce(Error("NEXT_REDIRECT"));
    await expect(submit()).rejects.toThrow("NEXT_REDIRECT");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "private" } });
    expect(await submit()).toMatchObject({ kind: "invalid", message: expect.not.stringContaining("private") });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "55P03", message: "private" } });
    expect(await submit()).toMatchObject({ kind: "invalid", message: "Billing is busy. Try again in a moment." });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await submit()).kind).toBe("uncertain");
  });
});
