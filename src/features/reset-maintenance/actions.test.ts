import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureActor, reviewFixture } from "./review.test-fixtures";
import type { SessionReview } from "./review";
const { context, stepUp, rpc, createClient, serviceRpc } = vi.hoisted(() => ({
  context: vi.fn(), stepUp: vi.fn(), rpc: vi.fn(), createClient: vi.fn(), serviceRpc: vi.fn(),
}));
vi.mock("./context", () => ({ requirePilotResetContext: context }));
vi.mock("@/lib/auth/privileged-step-up-guard", () => ({ requirePrivilegedStepUp: stepUp }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: createClient }));
import { submitMaintenanceReviewAction } from "./actions";
function form(review = reviewFixture()) {
  const data = new FormData(); data.set("review", JSON.stringify(review)); data.set("confirm", "reviewed"); return data;
}
const submit = (data = form()) => submitMaintenanceReviewAction({ kind: "idle" }, data);
beforeEach(() => {
  vi.resetAllMocks();
  context.mockResolvedValue({ organizationId: reviewFixture().binding.organization_id, userId: fixtureActor, operationalTimezone: "Asia/Phnom_Penh" });
  createClient.mockResolvedValue({ rpc }); stepUp.mockResolvedValue({ rpc: serviceRpc });
  rpc.mockResolvedValue({ data: "10000000-0000-4000-8000-000000000099", error: null });
});
describe("Pilot maintenance genuine-session actions", () => {
  it("requires current page-independent authority before inspecting input", async () => {
    context.mockRejectedValue(Error("not found")); await expect(submit(new FormData())).rejects.toThrow("not found");
    expect(createClient).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["freeze", "checkpoint", "prepare", "seal", "execute", "prepare-recovery", "execute-recovery"] as SessionReview["action"][])("issues only one fixed cookie-session RPC for %s", async action => {
    const review = reviewFixture(action), result = await submit(form(review));
    expect(result.kind).toBe("issued");
    expect(stepUp).toHaveBeenCalledWith(expect.objectContaining({ userId: fixtureActor }), { rpc });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("authorize_financial_reset_hosted_action", { p_binding: review.binding, p_action: action });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
  it("allows the distinct signed-in reviewer to endorse only the exact zero review", async () => {
    context.mockResolvedValue({ userId: "10000000-0000-4000-8000-000000000002", operationalTimezone: "Asia/Phnom_Penh" });
    rpc.mockResolvedValue({ data: null, error: null }); const review = reviewFixture("approve-zero-plan");
    expect((await submit(form(review))).kind).toBe("endorsed");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("approve_financial_reset_zero_plan", { p_operation_id: review.binding.operation_id, p_review_sha256: review.binding.zero_review_sha256 });
    expect(serviceRpc).not.toHaveBeenCalled();
  });
  it("does not authorize through a stale or failed step-up session", async () => {
    stepUp.mockRejectedValue(Error("verify session")); await expect(submit()).rejects.toThrow("verify session"); expect(rpc).not.toHaveBeenCalled();
  });
  it("shows the existing verification requirement without swallowing login redirects", async () => {
    stepUp.mockRejectedValue(Error("Privileged email verification required."));
    expect(await submit()).toMatchObject({ kind: "invalid", message: expect.stringContaining("Verify this signed-in session") });
    expect(rpc).not.toHaveBeenCalled();
    stepUp.mockRejectedValue(Error("NEXT_REDIRECT")); await expect(submit()).rejects.toThrow("NEXT_REDIRECT");
  });
  it("rejects missing consent, duplicate payload, unexpected field, changed digest and wrong actor", async () => {
    const noConsent = form(); noConsent.delete("confirm");
    const duplicate = form(); duplicate.append("review", "{}");
    const extra = form(); extra.set("rpc", "execute_reset");
    const changed = reviewFixture(); changed.bindingSha256 = "0".repeat(64);
    for (const input of [noConsent, duplicate, extra, form(changed)]) expect((await submit(input)).kind).toBe("invalid");
    context.mockResolvedValue({ userId: "other", operationalTimezone: "Asia/Phnom_Penh" }); expect((await submit()).kind).toBe("invalid");
    expect(createClient).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects changed organizational timezone", async () => {
    context.mockResolvedValue({ userId: fixtureActor, operationalTimezone: "UTC" }); expect((await submit()).kind).toBe("invalid"); expect(rpc).not.toHaveBeenCalled();
  });
  it("ignores framework metadata while keeping business fields and explicit consent strict", async () => {
    const metadataOnlyConsent = form(); metadataOnlyConsent.delete("confirm"); metadataOnlyConsent.set("$ACTION_confirm", "reviewed");
    const unknownBusiness = form(); unknownBusiness.set("$ACTION_REF_0", ""); unknownBusiness.set("role", "super_admin");
    const duplicateConsent = form(); duplicateConsent.set("$ACTION_ID_framework", ""); duplicateConsent.append("confirm", "reviewed");
    for (const input of [metadataOnlyConsent, unknownBusiness, duplicateConsent]) expect((await submit(input)).kind).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled(); expect(createClient).not.toHaveBeenCalled();
  });
  it.each(["42501", "23514", "P0001"])("sanitizes database refusal %s without retrying", async code => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "private details and credentials" } });
    const result = await submit(); expect(result.kind).toBe("invalid"); expect(JSON.stringify(result)).not.toContain("private details"); expect(rpc).toHaveBeenCalledOnce();
  });
  it("retains unknown outcome without reissuing a locator", async () => {
    rpc.mockRejectedValue(Error("private network error")); const result = await submit();
    expect(result.kind).toBe("uncertain"); expect(result.message).not.toContain("private"); expect(rpc).toHaveBeenCalledOnce();
  });
  it.each(["", "PGRST000", "503"])("locks a returned transport failure %s as unknown without retrying", async code => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "fetch failed private details" } });
    expect((await submit()).kind).toBe("uncertain"); expect(rpc).toHaveBeenCalledOnce();
  });
  it("does not claim issuance or endorsement from malformed RPC results", async () => {
    rpc.mockResolvedValue({ data: { token: "unexpected" }, error: null }); expect((await submit()).kind).toBe("uncertain");
    expect((await submit(form(reviewFixture("approve-zero-plan")))).kind).toBe("uncertain");
  });
});
