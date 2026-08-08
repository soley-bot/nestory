import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { setLedgerPeriodLockAction } from "@/features/ledger/actions";

describe("financial month lock action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminContext.mockResolvedValue({ organizationId: "org-1" });
    mocks.rpc.mockResolvedValue({ data: "lock-1", error: null });
  });

  it("uses explicit Super Admin authority and the canonical month-lock RPC", async () => {
    const formData = new FormData();
    formData.set("lockState", "locked");
    formData.set("periodStart", "2026-08");
    formData.set("reason", "Freeze August operational changes");

    await expect(setLedgerPeriodLockAction({}, formData)).resolves.toEqual({
      message: "Month locked.",
      status: "success",
    });

    expect(mocks.requireSuperAdminContext).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("set_financial_month_lock", {
      p_locked: true,
      p_month_start: "2026-08-01",
      p_organization_id: "org-1",
      p_reason: "Freeze August operational changes",
    });
  });
});
