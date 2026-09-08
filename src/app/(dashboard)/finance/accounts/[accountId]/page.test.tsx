import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFinanceAccountActivity: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  requireFinanceContext: vi.fn(),
  screenSpy: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/features/finance-accounts/data/finance-account-activity", () => ({
  getFinanceAccountActivity: mocks.getFinanceAccountActivity,
}));
vi.mock("@/features/finance-accounts/components/finance-account-activity-screen", () => ({
  FinanceAccountActivityScreen: (props: Record<string, unknown>) => {
    mocks.screenSpy(props);
    return <div>Account activity route</div>;
  },
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import FinanceAccountActivityPage from "@/app/(dashboard)/finance/accounts/[accountId]/page";

describe("Finance account activity route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceContext.mockResolvedValue({ organizationId: "organization-1" });
    mocks.getFinanceAccountActivity.mockResolvedValue({ rows: [] });
  });

  it("loads a protected account with normalized date and property filters", async () => {
    // Break caught: reading params synchronously under Next 16 or loading before
    // the Finance guard can route the wrong account outside the protected flow.
    const html = renderToStaticMarkup(await FinanceAccountActivityPage({
      params: Promise.resolve({ accountId: "account-1" }),
      searchParams: Promise.resolve({
        from: "2026-08-01",
        propertyId: "property-1",
        to: "2026-08-31",
      }),
    }));

    expect(html).toContain("Account activity route");
    expect(mocks.requireFinanceContext).toHaveBeenCalledOnce();
    expect(mocks.getFinanceAccountActivity).toHaveBeenCalledWith(
      "organization-1",
      "account-1",
      {
        periodEnd: "2026-08-31",
        periodStart: "2026-08-01",
        propertyId: "property-1",
      },
    );
  });

  it.each(["unknown-account", "unauthorized-account"])(
    "uses the same not-found path for %s",
    async (accountId) => {
      // Break caught: distinguishing forbidden from missing discloses the
      // existence of a property-scoped account the operator cannot read.
      mocks.getFinanceAccountActivity.mockResolvedValue(null);

      await expect(FinanceAccountActivityPage({
        params: Promise.resolve({ accountId }),
        searchParams: Promise.resolve({
          from: "2026-08-01",
          to: "2026-08-31",
        }),
      })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

      expect(mocks.notFound).toHaveBeenCalledOnce();
      expect(mocks.screenSpy).not.toHaveBeenCalled();
    },
  );
});
