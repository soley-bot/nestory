import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { readLocalDepositRentSnapshot } from "./candidate-reader";
import { confirmDepositCustody } from "./custody-actions";

vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getWorkspaceMembershipForUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("./candidate-reader", () => ({ readLocalDepositRentSnapshot: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const permissions = ["leases.view", "finance.view", "leases.change_terms", "finance.correct_records"];
const rpc = vi.fn();
const input = { leaseId: id(1), depositId: id(2), liabilityAccountId: id(3), custodian: "ips" as const,
  ownerId: null, date: "2026-10-09", held: "600.00", evidence: "Receipt review", key: id(4) };
function member(keys = permissions) {
  return { organizationId: id(5), permissionKeys: new Set(keys) } as unknown as NonNullable<Awaited<ReturnType<typeof getWorkspaceMembershipForUser>>>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: id(6) } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(member());
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  vi.mocked(readLocalDepositRentSnapshot).mockResolvedValue({ actorId: id(6), deposits: [{ id: id(2) }] } as Awaited<ReturnType<typeof readLocalDepositRentSnapshot>>);
  rpc.mockResolvedValue({ data: id(7), error: null });
});
describe("custody product action authority", () => {
  it.each(permissions)("does not call the financial command without %s", async missing => {
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(member(permissions.filter(key => key !== missing)));
    expect((await confirmDepositCustody(input)).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("takes organization from the verified session and preserves the original retry key", async () => {
    expect((await confirmDepositCustody(input)).status).toBe("success");
    expect((await confirmDepositCustody(input)).status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("confirm_deposit_rent_custody", expect.objectContaining({ p_org: id(5), p_deposit: id(2), p_expected_held: 600, p_key: id(4), p_owner: null }));
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
});
