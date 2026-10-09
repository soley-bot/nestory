import { beforeEach, describe, expect, it, vi } from "vitest";
// Real Auth context, permission builder and capability resolver. Only framework
// headers and ordinary client transport are mocked; actual cookie SQL is pending.
const transport = vi.hoisted(() => ({ create: vi.fn(), rpc: vi.fn(), claims: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: transport.create }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:50123" }) }));
import { getFinanceReportMembershipForUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createOrdinarySharedJournalSession, createDormantSharedJournalSession } from "./shared-journal-session";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), org = id(2), lease = id(5);
const approved = ["leases.view", "finance.view", "leases.change_terms", "finance.record_payments", "finance.correct_records"];
function fixture(permissions = approved, mode = "active") {
  const results: Record<string, unknown> = {
    organization_members: mode === "nonmember" ? null : { organization_id: org, role: "custom", branch_id: id(10), custom_role_id: id(11), organizations: { name: "Synthetic Nestory", slug: "nestory", theme_mode: "light", accent_preset: "ocean", accent_seed: null } },
    organization_authorization_states: { ordinary_access_enabled: mode !== "disabled" },
    organization_branches: { id: id(10), status: mode === "branch" ? "inactive" : "active", archived_at: null },
    organization_roles: { id: id(11), name: "Synthetic staff", status: mode === "role" ? "inactive" : "active", archived_at: null },
    organization_role_permissions: permissions.map(permission_key => ({ permission_key })),
  };
  transport.from.mockImplementation((table: string) => {
    const result = { data: results[table] ?? null, error: null };
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => result), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    for (const name of ["select", "eq", "order", "limit"] as const) query[name].mockReturnValue(query);
    return query;
  });
  transport.claims.mockResolvedValue({ data: { claims: { sub: actor, session_id: id(20) } }, error: null });
  transport.rpc.mockResolvedValue({ data: null, error: null });
  transport.create.mockResolvedValue({ from: transport.from, auth: { getClaims: transport.claims }, rpc: transport.rpc });
}
beforeEach(() => { vi.clearAllMocks(); fixture(); });
describe("journal session with actual membership and capability resolution", () => {
  it("resolves approved staff without publication while the report-only helper correctly remains restricted", async () => {
    const membership = await getWorkspaceMembershipForUser(actor);
    expect(membership?.permissionKeys).toEqual(new Set(approved));
    expect(membership?.capabilities.canReadFinanceReports).toBe(false);
    expect(await getFinanceReportMembershipForUser(actor)).toBeNull();
    await expect(createOrdinarySharedJournalSession().readCurrent(lease)).resolves.toBeNull();
    expect(transport.rpc).toHaveBeenCalledWith("get_deposit_rent_journal", { p_org: org, p_lease: lease });
  });
  it("retains backend dual-scope denials for partial roles without masking them as absent identity", async () => {
    for (const permissions of [["finance.view"], ["leases.view"], ["finance.publish"], []]) {
      transport.rpc.mockClear();
      fixture(permissions);
      transport.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Existing dual property permission denied" } });
      // Existing workspace resolver rejects an empty role before any RPC.
      await expect(createOrdinarySharedJournalSession().readCurrent(lease)).rejects.toMatchObject({ status: permissions.length ? 403 : 401 });
      if (!permissions.length) expect(transport.rpc).not.toHaveBeenCalled();
    }
  });
  it("rejects inactive role/branch, disabled ordinary access, nonmember and signed-out user before RPC", async () => {
    for (const mode of ["role", "branch", "disabled", "nonmember", "signed-out"]) {
      transport.rpc.mockClear(); fixture(approved, mode);
      if (mode === "signed-out") transport.claims.mockResolvedValue({ data: null, error: { message: "Signed out" } });
      await expect(createOrdinarySharedJournalSession().readCurrent(lease)).rejects.toMatchObject({ status: 401 });
      expect(transport.rpc).not.toHaveBeenCalled();
    }
  });
  it("preserves operation permission denials with the exact original saved key", async () => {
    for (const missing of ["leases.change_terms", "finance.record_payments", "finance.correct_records"]) {
      fixture(approved.filter(key => key !== missing));
      transport.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Checked operation permission denied" } });
      await expect(createOrdinarySharedJournalSession().executeOriginal(lease, { token: id(30), idempotencyKey: id(31), payloadHash: "a".repeat(64), revision: 2 })).rejects.toMatchObject({ status: 403 });
      expect(transport.rpc).toHaveBeenLastCalledWith("execute_deposit_rent_journal", { p_org: org, p_lease: lease, p_token: id(30), p_key: id(31), p_payload_hash: "a".repeat(64) });
    }
  });
  it("keeps the production binding disabled before client or identity lookup", async () => {
    await expect(createDormantSharedJournalSession().readCurrent(lease)).rejects.toThrow("disabled");
    expect(transport.create).not.toHaveBeenCalled();
  });
});
