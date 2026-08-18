import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireLeaseConfigurationContext: vi.fn(async () => ({
    organizationId: "10000000-0000-0000-0000-000000000001",
  })),
}));
vi.mock("@/lib/dates/business-date", () => ({
  getBusinessDateValue: () => "2026-08-18",
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: (table: string) => queryFor(table),
    rpc: mocks.rpc,
  })),
}));

import { activateSetupLeaseAction } from "@/features/property-setup/actions";

const leaseId = "20000000-0000-0000-0000-000000000001";
const expectedOccupancyId = "30000000-0000-0000-0000-000000000001";
const activeOccupancyId = "30000000-0000-0000-0000-000000000002";

beforeEach(() => {
  mocks.revalidatePath.mockReset();
  mocks.rpc.mockReset();
});

describe("activateSetupLeaseAction", () => {
  it("activates the draft and confirms move-in without leaving setup", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { leaseId, occupancyId: activeOccupancyId, status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({ data: activeOccupancyId, error: null });

    const formData = new FormData();
    formData.set("leaseId", leaseId);
    await activateSetupLeaseAction(formData);

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "transition_lease_lifecycle",
      expect.objectContaining({
        p_effective_date: "2026-08-18",
        p_expected_occupancy_id: expectedOccupancyId,
        p_lease_id: leaseId,
        p_transition: "activate",
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "record_current_lease_occupancy_evidence",
      expect.objectContaining({
        p_actual_move_in_date: "2026-08-18",
        p_expected_occupancy_id: activeOccupancyId,
        p_lease_id: leaseId,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/properties/setup");
  });
});

function queryFor(table: string) {
  const result = table === "current_leases"
    ? { data: { status: "draft" }, error: null }
    : { data: { id: expectedOccupancyId }, error: null };
  const query = {
    eq: () => query,
    is: () => query,
    limit: () => query,
    maybeSingle: vi.fn(async () => result),
    order: () => query,
    select: () => query,
  };
  return query;
}
