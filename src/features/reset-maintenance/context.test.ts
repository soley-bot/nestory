import { beforeEach, describe, expect, it, vi } from "vitest";
import { PILOT_RESET_ORGANIZATION, PILOT_RESET_PROJECT } from "./review";
const { workspace, requestHeaders, permission, environment, notFound, rpc } = vi.hoisted(() => ({
  workspace: vi.fn(), requestHeaders: vi.fn(), permission: vi.fn(), environment: vi.fn(),
  rpc: vi.fn(),
  notFound: vi.fn(() => { throw Error("not-found"); }),
}));
vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext: workspace }));
vi.mock("@/lib/auth/permission-context", () => ({ hasPermission: permission }));
vi.mock("@/lib/db/env", () => ({ getSupabaseEnv: environment }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { getPilotManualRestartStatus, requirePilotResetContext } from "./context";
const approved = { organizationId: PILOT_RESET_ORGANIZATION, organizationSlug: "pilot", role: "super_admin", roleKind: "super_admin",
  isSuperAdmin: true, branchId: undefined, personId: undefined, permissionContext: {} };
beforeEach(() => {
  vi.clearAllMocks(); workspace.mockResolvedValue(approved); requestHeaders.mockResolvedValue(new Headers({ host: "pilot.nestory-kh.com" }));
  permission.mockReturnValue(true); environment.mockReturnValue({ supabaseUrl: `https://${PILOT_RESET_PROJECT}.supabase.co` });
});
describe("Pilot maintenance tenant and membership boundary", () => {
  it("allows only the current unscoped Pilot super admin with all existing permissions", async () => {
    expect(await requirePilotResetContext()).toBe(approved);
    expect(permission.mock.calls.map(call => call[1])).toEqual(["finance.correct_records", "finance.close_periods", "leases.change_terms"]);
  });
  it.each([
    { organizationId: "other" }, { organizationSlug: "other" }, { role: "custom" }, { roleKind: "custom" },
    { isSuperAdmin: false }, { branchId: "branch" }, { personId: "person" },
  ])("hides maintenance for altered membership %j", async changed => {
    workspace.mockResolvedValue({ ...approved, ...changed }); await expect(requirePilotResetContext()).rejects.toThrow("not-found");
  });
  it.each(["nestory-kh.com", "other.nestory-kh.com", "pilot.nestory-kh.com.evil.invalid", "localhost:3000", "preview.vercel.app"])("refuses host %s", async host => {
    requestHeaders.mockResolvedValue(new Headers({ host })); await expect(requirePilotResetContext()).rejects.toThrow("not-found");
  });
  it("refuses wrong backend project or a missing current permission", async () => {
    environment.mockReturnValue({ supabaseUrl: "https://other.supabase.co" }); await expect(requirePilotResetContext()).rejects.toThrow("not-found");
    environment.mockReturnValue({ supabaseUrl: `https://${PILOT_RESET_PROJECT}.supabase.co` }); permission.mockReturnValue(false);
    await expect(requirePilotResetContext()).rejects.toThrow("not-found");
  });
  it("never presents malformed or refused native status as permission to restart", async () => {
    rpc.mockResolvedValue({ error: { code: "42501" }, data: null }); expect(await getPilotManualRestartStatus()).toBeNull();
    rpc.mockResolvedValue({ error: null, data: { eligible: true, status: "ready" } }); expect(await getPilotManualRestartStatus()).toBeNull();
    expect(rpc).toHaveBeenCalledWith("get_pilot_manual_restart_status");
  });
});
