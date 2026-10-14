import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordLeaseDepositEventAction, reverseLeaseDepositEventAction } from "@/features/leases/actions";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
const rpc = vi.fn();

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    amount: "100", eventDate: "2026-07-01", eventType: "received",
    idempotencyKey: "synthetic-deposit-1", reference: "Synthetic deposit",
    leaseDepositId: "00000000-0000-4000-8000-000000000001",
    liabilityAccountId: "00000000-0000-4000-8000-000000000002",
    eventId: "00000000-0000-4000-8000-000000000003",
    organizationId: "synthetic-company-b",
  })) data.set(key, value);
  return data;
}

describe("restricted deposit action authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requirePermission).mockResolvedValue({ organizationId: "synthetic-company-a" } as never);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
    rpc.mockResolvedValue({ error: null });
  });

  it.each([
    ["record", recordLeaseDepositEventAction, "record_lease_deposit_event_idempotent"],
    ["reverse", reverseLeaseDepositEventAction, "reverse_lease_deposit_event"],
  ] as const)("%s currently grants deposit mutation through lease term permission", async (_, action, command) => {
    expect(await action({}, form())).toMatchObject({ status: "success" });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("leases.change_terms");
    expect(rpc).toHaveBeenCalledWith(command, expect.objectContaining({ p_organization_id: "synthetic-company-a" }));
  });

  it.each([recordLeaseDepositEventAction, reverseLeaseDepositEventAction])("denies deposit mutation before opening the database when permission is absent", async (action) => {
    const denied = new Error("Synthetic permission denial");
    vi.mocked(requirePermission).mockRejectedValue(denied);
    await expect(action({}, form())).rejects.toBe(denied);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([recordLeaseDepositEventAction, reverseLeaseDepositEventAction])("preserves database rejection of linked IDs outside authorized scope", async (action) => {
    rpc.mockResolvedValue({ error: { message: "Not authorized", code: "42501" } });
    expect(await action({}, form())).toMatchObject({ status: "error" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_organization_id).toBe("synthetic-company-a");
  });
});
