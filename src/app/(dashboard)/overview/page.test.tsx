import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildAdminWorkspaceQueue,
  getOverviewScreenData,
  overviewScreenSpy,
  requireSuperAdminContext,
} = vi.hoisted(() => ({
  buildAdminWorkspaceQueue: vi.fn(),
  getOverviewScreenData: vi.fn(),
  overviewScreenSpy: vi.fn(),
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/features/overview/data/overview", () => ({
  getOverviewScreenData,
}));
vi.mock("@/features/workspace-operations/admin-workspace", () => ({
  buildAdminWorkspaceQueue,
}));
vi.mock("@/features/overview/components/overview-screen", () => ({
  OverviewScreen: (props: Record<string, unknown>) => {
    overviewScreenSpy(props);
    return <div>Overview route</div>;
  },
}));

import OverviewPage from "@/app/(dashboard)/overview/page";

describe("OverviewPage", () => {
  beforeEach(() => {
    buildAdminWorkspaceQueue.mockReset();
    getOverviewScreenData.mockReset();
    overviewScreenSpy.mockReset();
    requireSuperAdminContext.mockReset();
  });

  it("passes the prioritized attention projection into the Super Admin workspace", async () => {
    const data = { attentionItems: [{ id: "rent" }] };
    const attentionQueue = [{ id: "rent", priority: 10 }];
    requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    getOverviewScreenData.mockResolvedValue(data);
    buildAdminWorkspaceQueue.mockReturnValue(attentionQueue);

    const html = renderToStaticMarkup(
      await OverviewPage({ searchParams: Promise.resolve({ month: "2026-08" }) }),
    );

    expect(html).toContain("Overview route");
    expect(buildAdminWorkspaceQueue).toHaveBeenCalledWith(data);
    expect(overviewScreenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ attentionQueue, data }),
    );
  });
});
