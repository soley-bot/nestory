import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinanceSourcesData: vi.fn(),
  requireFinanceContext: vi.fn(),
  screenSpy: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/features/finance-sources/data/finance-sources", () => ({
  getFinanceSourcesData: mocks.getFinanceSourcesData,
}));
vi.mock("@/features/finance-sources/components/finance-sources-screen", () => ({
  FinanceSourcesScreen: (props: Record<string, unknown>) => {
    mocks.screenSpy(props);
    return <div>Funding source route</div>;
  },
}));

import FundingSourcesPage from "@/app/(dashboard)/finance/funding-sources/page";

describe("Finance funding sources route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFinanceSourcesData.mockResolvedValue({ properties: [], sources: [] });
  });

  it("admits Finance readers while exposing mutation authority explicitly", async () => {
    mocks.requireFinanceContext.mockResolvedValue({
      capabilities: { canManageReconciliationSources: false },
      organizationId: "organization-1",
    });

    const html = renderToStaticMarkup(await FundingSourcesPage());

    expect(html).toContain("Funding source route");
    expect(mocks.getFinanceSourcesData).toHaveBeenCalledWith("organization-1");
    expect(mocks.screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ canManageSources: false }),
    );
  });
});
