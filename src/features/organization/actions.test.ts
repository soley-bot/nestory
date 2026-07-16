import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, requireAdminContext, rpc } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc })),
}));
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { updateMemberAccessAction } from "@/features/organization/actions";

describe("updateMemberAccessAction", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    requireAdminContext.mockReset();
    rpc.mockReset();
    requireAdminContext.mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
      role: "admin",
      userId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("returns a specific safe message when the database protects the last admin", async () => {
    rpc.mockResolvedValue({
      error: { message: "Cannot demote the last administrator" },
    });
    const formData = new FormData();
    formData.set("memberId", "33333333-3333-4333-8333-333333333333");
    formData.set("role", "manager");
    formData.set("branchId", "");
    formData.set("personId", "");

    await expect(updateMemberAccessAction({}, formData)).resolves.toEqual({
      message: "Add another administrator before changing this role.",
      status: "error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
