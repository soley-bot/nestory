import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildAdminWorkspaceQueue,
  getOverviewScreenData,
  overviewScreenSpy,
  requireSuperAdminContext,
  getFinancialWriteContext,
} = vi.hoisted(() => ({
  buildAdminWorkspaceQueue: vi.fn(),
  getOverviewScreenData: vi.fn(),
  overviewScreenSpy: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  getFinancialWriteContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ getFinancialWriteContext }));
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
    getFinancialWriteContext.mockReset().mockResolvedValue({ financial_start_date: null });
  });

  it("offers a valid month without reading an unavailable financial period", async () => {
    requireSuperAdminContext.mockResolvedValue({ organizationId: "org" });
    getFinancialWriteContext.mockResolvedValue({ financial_start_date: "2026-10-01" });
    const html = renderToStaticMarkup(await OverviewPage({ searchParams: Promise.resolve({ month: "2026-09", propertyId: "11111111-1111-4111-8111-111111111111", lens: "leasing" }) }));
    expect(getOverviewScreenData).not.toHaveBeenCalled();
    expect(html).toContain("Open October 2026");
    expect(html).toContain("month=2026-10");
    expect(html).toContain("propertyId=11111111-1111-4111-8111-111111111111");
    expect(html).toContain("lens=leasing");
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
