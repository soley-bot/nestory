import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinanceAccountRegisterData: vi.fn(),
  requireFinanceContext: vi.fn(),
  screenSpy: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: mocks.requireFinanceContext }));
vi.mock("@/features/finance-accounts/data/finance-accounts", () => ({
  getFinanceAccountRegisterData: mocks.getFinanceAccountRegisterData,
}));
vi.mock("@/features/finance-accounts/components/finance-account-register", () => ({
  FinanceAccountRegister: (props: Record<string, unknown>) => {
    mocks.screenSpy(props);
    return <div>Chart route</div>;
  },
}));

import FinanceAccountsPage from "@/app/(dashboard)/finance/accounts/page";

describe("Finance accounts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFinanceAccountRegisterData.mockResolvedValue({ groups: [], properties: [] });
  });

  it("loads the protected catalog and exposes Super Admin mutation authority", async () => {
    // Break caught: client-side loading or a capability proxy can bypass the
    // reviewed server route and its exact Super Admin management boundary.
    mocks.requireFinanceContext.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "organization-1",
    });

    const html = renderToStaticMarkup(await FinanceAccountsPage({ searchParams: Promise.resolve({ page: "25", query: "Late account" }) }));

    expect(html).toContain("Chart route");
    expect(mocks.getFinanceAccountRegisterData).toHaveBeenCalledWith("organization-1", expect.objectContaining({ page: 25, query: "Late account" }));
    expect(mocks.screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ canManageAccounts: true, groups: [], properties: [] }),
    );
  });
});
