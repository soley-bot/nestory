import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));

import {
  archiveTimelineEventAction,
  createTimelineEventAction,
  restoreTimelineEventAction,
  updateTimelineEventAction,
} from "@/features/timeline/actions";

describe("timeline action authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ organizationId: "org-1" });
  });

  it("uses property write for manual create and update", async () => {
    await createTimelineEventAction({}, new FormData());
    await updateTimelineEventAction({}, new FormData());
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, "properties.write");
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, "properties.write");
  });

  it("uses property archive for manual lifecycle transitions", async () => {
    await archiveTimelineEventAction({}, new FormData());
    await restoreTimelineEventAction({}, new FormData());
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, "properties.archive");
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, "properties.archive");
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });
});
