import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: () => ({ rpc }) }));
import { getOrdinaryAccessReadiness } from "./ordinary-access-data";
import { ordinaryAccessTestReadiness, ordinaryAccessTestOrganizationId } from "./ordinary-access-test-fixtures";

const organizationId = ordinaryAccessTestOrganizationId;
const readiness = ordinaryAccessTestReadiness();
beforeEach(() => {
  rpc.mockReset();
});

describe("ordinary staff access readiness", () => {
  it("preserves the checked scope, authority and impact for confirmation", async () => {
    rpc.mockResolvedValue({ data: readiness, error: null });
    await expect(getOrdinaryAccessReadiness(organizationId)).resolves.toEqual({
      kind: "ready", readiness,
    });
    expect(rpc).toHaveBeenCalledWith("get_organization_ordinary_access_activation", {
      p_organization_id: organizationId,
    });
  });

  it("preserves contained blockers without making activation available", async () => {
    const contained = {
      ...readiness,
      activation_ready: false,
      blockers: ["legacy_memberships", "transition_manifest", "invalid_invitations"],
    };
    rpc.mockResolvedValue({ data: contained, error: null });
    await expect(getOrdinaryAccessReadiness(organizationId)).resolves.toEqual({
      kind: "ready", readiness: contained,
    });
  });

  it.each([
    null,
    [],
    { ...readiness, organization_id: "22222222-2222-4222-8222-222222222222" },
    { ...readiness, authorization_version: Number.MAX_SAFE_INTEGER + 1 },
    { ...readiness, authorization_version: "3" },
    { ...readiness, ordinary_member_count: -1 },
    { ...readiness, live_ordinary_invitation_count: 1.5 },
    { ...readiness, blockers: ["unknown_future_guard"], activation_ready: false },
    { ...readiness, blockers: ["transition_manifest"] },
    { ...readiness, ordinary_access_enabled: true },
    { ...readiness, active_branch_count: 0 },
    { ...readiness, unscoped_property_count: 1 },
    { ...readiness, conflicting_record_count: 1 },
    { ...readiness, property_count: 0, unscoped_property_count: 1, activation_ready: false },
    { ...readiness, impact_fingerprint: "not-a-fingerprint" },
    { ...readiness, impact_memberships: [] },
    { ...readiness, impact_invitations: [] },
    { ...readiness, impact_memberships: [readiness.impact_memberships[0], readiness.impact_memberships[0]] },
    { ...readiness, impact_invitations: [{ ...readiness.impact_invitations[0], permission_keys: ["future.permission"] }] },
    { ...readiness, impact_invitations: [{ ...readiness.impact_invitations[0], role_name: null }] },
    { ...readiness, impact_invitations: [{ ...readiness.impact_invitations[0], branch_id: null }] },
    { ...readiness, impact_invitations: [{ ...readiness.impact_invitations[0], permission_keys: [] }] },
  ])("fails closed for a missing, foreign or inconsistent readiness response", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    expect((await getOrdinaryAccessReadiness(organizationId)).kind).toBe("unavailable");
  });

  it("keeps nullable blocked legacy scope explicit without accepting it as ready", async () => {
    const contained = {
      ...readiness,
      activation_ready: false,
      blockers: ["invalid_invitations"],
      impact_invitations: [{
        ...readiness.impact_invitations[0],
        branch_id: null, branch_name: null, role_id: null, role_name: "finance_member",
      }],
    };
    rpc.mockResolvedValue({ data: contained, error: null });
    await expect(getOrdinaryAccessReadiness(organizationId)).resolves.toEqual({
      kind: "ready", readiness: contained,
    });
  });

  it("does not expose RPC errors or mistake unavailable state for an empty ready company", async () => {
    rpc.mockResolvedValue({ data: readiness, error: { message: "RPC schema detail" } });
    const result = await getOrdinaryAccessReadiness(organizationId);
    expect(result.kind).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("RPC schema detail");
  });

  it("returns a recoverable unavailable state on connection failure", async () => {
    rpc.mockRejectedValue(new Error("Network unavailable"));
    expect((await getOrdinaryAccessReadiness(organizationId)).kind).toBe("unavailable");
  });
});
