import { beforeEach, describe, expect, it, vi } from "vitest";

const { eq, from, is, order, select } = vi.hoisted(() => {
  const order = vi.fn();
  const is = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ eq, is }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { eq, from, is, order, select };
});

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ from }),
}));

import { getActivePropertyBranchOptions } from "./property-branches";

describe("getActivePropertyBranchOptions", () => {
  beforeEach(() => {
    eq.mockClear();
    from.mockClear();
    is.mockClear();
    order.mockReset();
    select.mockClear();
  });

  it("loads only active, unarchived branches in the organization", async () => {
    order.mockResolvedValue({
      data: [{ code: "CTR", id: "branch-a", name: "Central" }],
      error: null,
    });

    await expect(getActivePropertyBranchOptions("organization-1")).resolves.toEqual([
      { id: "branch-a", label: "CTR — Central" },
    ]);

    expect(from).toHaveBeenCalledWith("organization_branches");
    expect(eq).toHaveBeenNthCalledWith(1, "organization_id", "organization-1");
    expect(eq).toHaveBeenNthCalledWith(2, "status", "active");
    expect(is).toHaveBeenCalledWith("archived_at", null);
    expect(order).toHaveBeenCalledWith("name", { ascending: true });
  });
});
