import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  revalidatePath: vi.fn(),
  requireFinancialMonthLockContext: vi.fn(),
  requireFinancialMonthUnlockContext: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireFinancialMonthLockContext: mocks.requireFinancialMonthLockContext,
  requireFinancialMonthUnlockContext: mocks.requireFinancialMonthUnlockContext,
  requirePermission: mocks.requirePermission,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  })),
}));

import {
  attachLedgerReceiptAction,
  setLedgerPeriodLockAction,
} from "@/features/ledger/actions";
import { invalidPdfFile } from "@/test-utils/upload-content";

describe("financial month lock action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinancialMonthLockContext.mockResolvedValue({
      isSuperAdmin: false,
      organizationId: "org-1",
      role: "custom",
    });
    mocks.requireFinancialMonthUnlockContext.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "org-1",
      role: "super_admin",
    });
    mocks.requireSuperAdminContext.mockResolvedValue({ organizationId: "org-1" });
    mocks.requirePermission.mockResolvedValue({
      branchId: "branch-1",
      isSuperAdmin: false,
      organizationId: "org-1",
    });
    mocks.rpc.mockResolvedValue({ data: "lock-1", error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload });
    mocks.from.mockImplementation((table: string) => {
      const query = {
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (table === "ledger_entries") {
            return {
              data: {
                id: "10000000-0000-4000-8000-000000000001",
                property_id: "20000000-0000-4000-8000-000000000001",
                unit_id: null,
              },
              error: null,
            };
          }
          if (table === "properties") {
            return { data: { branch_id: "branch-1" }, error: null };
          }
          return { data: null, error: null };
        }),
        order: vi.fn(() => query),
        select: vi.fn(() => query),
      };
      return query;
    });
  });

  it("uses Finance month-lock authority and the canonical RPC for locking", async () => {
    const formData = new FormData();
    formData.set("lockState", "locked");
    formData.set("periodStart", "2026-08");
    formData.set("reason", "Freeze August operational changes");

    await expect(setLedgerPeriodLockAction({}, formData)).resolves.toEqual({
      message: "Month locked.",
      status: "success",
    });

    expect(mocks.requireFinancialMonthLockContext).toHaveBeenCalledOnce();
    expect(mocks.requireFinancialMonthUnlockContext).not.toHaveBeenCalled();
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("set_financial_month_lock", {
      p_locked: true,
      p_month_start: "2026-08-01",
      p_organization_id: "org-1",
      p_reason: "Freeze August operational changes",
    });
  });

  it("requires the narrower Super Admin-only unlock capability", async () => {
    const formData = new FormData();
    formData.set("lockState", "unlocked");
    formData.set("periodStart", "2026-08");
    formData.set("reason", "Approved correction window");

    await expect(setLedgerPeriodLockAction({}, formData)).resolves.toEqual({
      message: "Month unlocked.",
      status: "success",
    });

    expect(mocks.requireFinancialMonthUnlockContext).toHaveBeenCalledOnce();
    expect(mocks.requireFinancialMonthLockContext).not.toHaveBeenCalled();
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it("rejects a blank ordinary operational-lock reason before the RPC", async () => {
    const formData = new FormData();
    formData.set("lockState", "locked");
    formData.set("periodStart", "2026-08");
    formData.set("reason", "   ");

    await expect(setLedgerPeriodLockAction({}, formData)).resolves.toEqual({
      fieldErrors: { reason: ["Enter an operational lock reason."] },
      status: "error",
    });

    expect(mocks.requireFinancialMonthLockContext).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves Super Admin lock handling for an empty optional reason", async () => {
    mocks.requireFinancialMonthLockContext.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "org-1",
      role: "super_admin",
    });
    const formData = new FormData();
    formData.set("lockState", "locked");
    formData.set("periodStart", "2026-08");
    formData.set("reason", "");

    await expect(setLedgerPeriodLockAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("validates the requested transition before selecting authority", async () => {
    const formData = new FormData();
    formData.set("lockState", "invalid");
    formData.set("periodStart", "2026-08");
    formData.set("reason", "Invalid transition");

    await expect(setLedgerPeriodLockAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });

    expect(mocks.requireFinancialMonthLockContext).not.toHaveBeenCalled();
    expect(mocks.requireFinancialMonthUnlockContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires correction authority before handling a ledger receipt", async () => {
    const result = await attachLedgerReceiptAction({}, new FormData());

    expect(result).toEqual({
      fieldErrors: { entryId: ["Choose a ledger entry."] },
      status: "error",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "finance.correct_records",
    );
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it("rejects spoofed receipt bytes before Storage access", async () => {
    const formData = new FormData();
    formData.set("entryId", "10000000-0000-4000-8000-000000000001");
    formData.set("receipt", invalidPdfFile("receipt.pdf"));

    await expect(attachLedgerReceiptAction({}, formData)).resolves.toEqual({
      fieldErrors: {
        receipt: ["Upload a PDF, JPG, PNG, or WebP receipt."],
      },
      status: "error",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
