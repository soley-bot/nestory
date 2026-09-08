import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinanceAccountsData: vi.fn(),
  requireFinanceContext: vi.fn(),
  screenSpy: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: mocks.requireFinanceContext }));
vi.mock("@/features/finance-accounts/data/finance-accounts", () => ({
  getFinanceAccountsData: mocks.getFinanceAccountsData,
}));
vi.mock("@/features/finance-accounts/components/finance-accounts-screen", () => ({
  FinanceAccountsScreen: (props: Record<string, unknown>) => {
    mocks.screenSpy(props);
    return <div>Chart route</div>;
  },
}));

import FinanceAccountsPage from "@/app/(dashboard)/finance/accounts/page";

describe("Finance accounts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFinanceAccountsData.mockResolvedValue({ groups: [], properties: [] });
  });

  it("loads the protected catalog and exposes Super Admin mutation authority", async () => {
    // Break caught: client-side loading or a capability proxy can bypass the
    // reviewed server route and its exact Super Admin management boundary.
    mocks.requireFinanceContext.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "organization-1",
    });

    const html = renderToStaticMarkup(await FinanceAccountsPage());

    expect(html).toContain("Chart route");
    expect(mocks.getFinanceAccountsData).toHaveBeenCalledWith("organization-1");
    expect(mocks.screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ canManageAccounts: true, groups: [], properties: [] }),
    );
  });
});
