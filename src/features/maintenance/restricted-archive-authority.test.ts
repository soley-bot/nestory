import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveMaintenanceCaseAction, restoreMaintenanceCaseAction } from "@/features/maintenance/actions";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requirePermission: vi.fn(), requireSuperAdminContext: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("restricted maintenance lifecycle action boundary", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([archiveMaintenanceCaseAction, restoreMaintenanceCaseAction])("requires Super Admin before resolving a guessed case ID", async (action) => {
    const denied = new Error("Synthetic Super Admin denial");
    vi.mocked(requireSuperAdminContext).mockRejectedValue(denied);
    const data = new FormData();
    data.set("taskId", "00000000-0000-4000-8000-000000000099");
    data.set("organizationId", "synthetic-company-b");
    await expect(action({}, data)).rejects.toBe(denied);
    expect(requireSuperAdminContext).toHaveBeenCalledTimes(1);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
