import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTimelineScreenData: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("@/features/timeline/data/timeline", () => ({
  getTimelineScreenData: mocks.getTimelineScreenData,
}));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));
vi.mock("@/features/timeline/components/timeline-screen", () => ({
  TimelineScreen: vi.fn((props: unknown) => props),
}));

import { renderTimelineRoute } from "@/features/timeline/timeline-route";

describe("timeline route scope authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const context = {
      organizationId: "org-1",
      permissionKeys: new Set(["properties.write"]),
    };
    mocks.requirePermission.mockResolvedValue(context);
    mocks.requireSuperAdminContext.mockResolvedValue(context);
    mocks.getTimelineScreenData.mockResolvedValue({
      eventTypes: [], events: [], pagination: {}, propertyOptions: [], recentChanges: [], unitOptions: [], viewQuery: {},
    });
  });

  it.each([
    ["property", "properties.view"],
    ["maintenance", "maintenance.view"],
    ["financial", "finance.view"],
  ] as const)("uses %s scope permission", async (scope, permission) => {
    const result = await renderTimelineRoute({ scope, searchParams: Promise.resolve({}), title: "History" });
    expect(mocks.requirePermission).toHaveBeenCalledWith(permission);
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
    expect(result.props.canWrite).toBe(true);
  });

  it("keeps the global register Super Admin-only", async () => {
    await renderTimelineRoute({ scope: "global", searchParams: Promise.resolve({}), title: "History" });
    expect(mocks.requireSuperAdminContext).toHaveBeenCalledOnce();
  });
});
