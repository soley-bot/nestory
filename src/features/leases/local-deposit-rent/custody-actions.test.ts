import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { readLocalDepositRentSnapshot } from "./candidate-reader";
import { confirmDepositCustody, getDepositCustodyOptions } from "./custody-actions";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";

vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getWorkspaceMembershipForUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("./candidate-reader", () => ({ readLocalDepositRentSnapshot: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/finance-operations/data/scoped-finance-context", () => ({ loadScopedFinanceContext: vi.fn() }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const permissions = ["leases.view", "finance.view", "leases.change_terms", "finance.correct_records"];
const rpc = vi.fn();
const input = { leaseId: id(1), depositId: id(2), liabilityAccountId: id(3), custodian: "ips" as const,
  ownerId: null, date: "2026-10-09", held: "600.00", evidence: "Receipt review", key: id(4), fingerprint: "c".repeat(64) };
function member(keys = permissions) {
  return { organizationId: id(5), permissionKeys: new Set(keys) } as unknown as NonNullable<Awaited<ReturnType<typeof getWorkspaceMembershipForUser>>>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: id(6) } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(member());
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  vi.mocked(readLocalDepositRentSnapshot).mockResolvedValue({ actorId: id(6), businessDate: "2026-10-09", fingerprint: input.fingerprint, deposits: [{ id: id(2), custodyCurrent: true }] } as Awaited<ReturnType<typeof readLocalDepositRentSnapshot>>);
  rpc.mockResolvedValue({ data: id(7), error: null });
});
describe("custody product action authority", () => {
  it("rejects a date after the checked company business date before calling the command", async () => {
    expect((await confirmDepositCustody({ ...input, date: "2026-10-10" })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(permissions)("does not call the financial command without %s", async missing => {
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(member(permissions.filter(key => key !== missing)));
    expect((await confirmDepositCustody(input)).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("takes organization from the verified session and preserves the original retry key", async () => {
    expect((await confirmDepositCustody(input)).status).toBe("success");
    expect((await confirmDepositCustody(input)).status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("confirm_deposit_rent_custody", expect.objectContaining({ p_org: id(5), p_deposit: id(2), p_expected_held: 600, p_key: `${id(4)}:${input.fingerprint}`, p_owner: null }));
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it("rejects a browser-supplied organization or actor", async () => {
    expect((await confirmDepositCustody({ ...input, organizationId: id(8) } as typeof input)).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a deposit outside the checked lease", async () => {
    expect((await confirmDepositCustody({ ...input, depositId: id(9) })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps a denied database command as an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Access changed" } });
    expect((await confirmDepositCustody(input)).status).toBe("error");
  });
  it("does not report a historical replay as current custody after later deposit activity", async () => {
    vi.mocked(readLocalDepositRentSnapshot).mockResolvedValue({ actorId: id(6), businessDate: "2026-10-09", deposits: [{ id: id(2), custodyCurrent: false }] } as Awaited<ReturnType<typeof readLocalDepositRentSnapshot>>);
    expect(await confirmDepositCustody(input)).toMatchObject({ status: "error", message: expect.stringContaining("original confirmation is saved") });
    expect(rpc).toHaveBeenCalledWith("confirm_deposit_rent_custody", expect.objectContaining({ p_key: `${input.key}:${input.fingerprint}` }));
  });
  it("offers stale custody for explicit renewal while excluding current and archived deposits", async () => {
    vi.mocked(readLocalDepositRentSnapshot).mockResolvedValue({ actorId: id(6), businessDate: "2026-10-09", fingerprint: input.fingerprint, propertyId: id(10), deposits: [
      { id: id(2), label: "Original security deposit", held: "600.00", custodyVerified: true, custodyCurrent: false, liabilityAccountActive: true, archived: false },
      { id: id(8), custodyVerified: true, custodyCurrent: true, archived: false },
      { id: id(9), custodyVerified: false, custodyCurrent: false, archived: true },
      { id: id(11), custodyVerified: true, custodyCurrent: false, liabilityAccountActive: false, archived: false },
      { id: id(12), label: "New deposit", held: "20.00", custodyVerified: false, custodyCurrent: false, liabilityAccountActive: false, archived: false },
    ] } as Awaited<ReturnType<typeof readLocalDepositRentSnapshot>>);
    vi.mocked(loadScopedFinanceContext).mockResolvedValue({ owner_assignments: [], people: [] } as unknown as Awaited<ReturnType<typeof loadScopedFinanceContext>>);
    expect(await getDepositCustodyOptions(input.leaseId)).toMatchObject({ status: "success", fingerprint: input.fingerprint, deposits: [{ id: id(2), needsRenewal: true, held: "600.00" }, { id: id(12), needsRenewal: false, held: "20.00" }] });
  });
});
