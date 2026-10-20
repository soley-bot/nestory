import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, requireSuperAdminContext, rpc } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: () => ({ rpc }) }));

import {
  activateOrdinaryAccessAction,
  refreshOrdinaryAccessReadinessAction,
} from "./ordinary-access-actions";
import type { OrdinaryAccessActivationRequest } from "./ordinary-access";
import { ordinaryAccessTestReadiness, ordinaryAccessTestOrganizationId } from "./ordinary-access-test-fixtures";

const organizationId = ordinaryAccessTestOrganizationId;
const fingerprint = "a".repeat(64);
const request: OrdinaryAccessActivationRequest = {
  confirm: true,
  expectedVersion: 3,
  expectedImpactFingerprint: fingerprint,
};
const enabled = {
  ...ordinaryAccessTestReadiness(),
  authorization_version: 4,
  ordinary_access_enabled: true,
  activation_ready: false,
  impact_fingerprint: "b".repeat(64),
};

beforeEach(() => {
  vi.resetAllMocks();
  requireSuperAdminContext.mockResolvedValue({ organizationId });
});

describe("ordinary staff access actions", () => {
  it("activates only the trusted company and exact reviewed version/fingerprint", async () => {
    rpc.mockResolvedValue({ data: { ...enabled, status: "activated" }, error: null });
    await expect(activateOrdinaryAccessAction(request)).resolves.toEqual({
      kind: "activated", readiness: enabled,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("activate_organization_ordinary_access", {
      p_organization_id: organizationId,
      p_expected_version: 3,
      p_expected_impact_fingerprint: fingerprint,
      p_confirm: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/access");
    expect(revalidatePath).toHaveBeenCalledWith("/workspace");
  });

  it("requires current admin authority before either read or write", async () => {
    requireSuperAdminContext.mockRejectedValue(new Error("Denied"));
    await expect(activateOrdinaryAccessAction(request)).rejects.toThrow("Denied");
    await expect(refreshOrdinaryAccessReadinessAction()).rejects.toThrow("Denied");
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    { ...request, confirm: false },
    { ...request, confirm: "true" },
    { ...request, expectedVersion: 0 },
    { ...request, expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...request, expectedImpactFingerprint: "" },
    { ...request, expectedImpactFingerprint: "a".repeat(63) },
    { ...request, organizationId: "22222222-2222-4222-8222-222222222222" },
  ])("rejects missing consent, invalid preconditions and client-supplied scope", async (input) => {
    const result = await activateOrdinaryAccessAction(input as OrdinaryAccessActivationRequest);
    expect(result.kind).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recognizes a verified idempotent already-enabled receipt", async () => {
    rpc.mockResolvedValue({ data: { ...enabled, status: "already_enabled" }, error: null });
    expect((await activateOrdinaryAccessAction(request)).kind).toBe("already_enabled");
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    { ...enabled, status: "saved" },
    { ...enabled, ordinary_access_enabled: false, status: "activated" },
    { ...enabled, organization_id: "22222222-2222-4222-8222-222222222222", status: "activated" },
    { ...enabled, authorization_version: 3, status: "activated" },
  ])("does not report success for an absent, foreign or inconsistent receipt", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    const result = await activateOrdinaryAccessAction(request);
    expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("could not be confirmed") });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("returns a stale-preview result without retrying or invalidating", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Ordinary access readiness changed." } });
    expect((await activateOrdinaryAccessAction(request)).kind).toBe("stale");
    expect(rpc).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("preserves required session verification without sending or retrying", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Privileged email verification required" } });
    await expect(activateOrdinaryAccessAction(request)).resolves.toEqual({
      kind: "error", message: "Verify this signed-in session by email, then retry saving.",
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["42501", "55000"])("keeps denied/contained responses unsuccessful", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "private implementation detail" } });
    const result = await activateOrdinaryAccessAction(request);
    expect(result.kind).toBe("error");
    expect(JSON.stringify(result)).not.toContain("private implementation detail");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("leaves a transport failure uncertain without a duplicate write", async () => {
    rpc.mockRejectedValue(new Error("Connection lost"));
    const result = await activateOrdinaryAccessAction(request);
    expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("could not be confirmed") });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("refreshes only the current admin's company", async () => {
    rpc.mockResolvedValue({ data: enabled, error: null });
    await expect(refreshOrdinaryAccessReadinessAction()).resolves.toEqual({
      kind: "ready", readiness: enabled,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_organization_ordinary_access_activation", {
      p_organization_id: organizationId,
    });
  });
});
