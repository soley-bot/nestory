import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFinanceOperationsData, requireFinanceContext, screenSpy } = vi.hoisted(
  () => ({
    getFinanceOperationsData: vi.fn(),
    requireFinanceContext: vi.fn(),
    screenSpy: vi.fn(),
  }),
);

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData,
}));
vi.mock(
  "@/features/finance-operations/components/finance-operations-screen",
  () => ({
    FinanceOperationsScreen: (props: Record<string, unknown>) => {
      screenSpy(props);
      return <div>Finance route</div>;
    },
  }),
);

import FinancePage from "@/app/(dashboard)/finance/page";
import RentIncomePage from "@/app/(dashboard)/rent-income/page";

describe("finance routes", () => {
  beforeEach(() => {
    getFinanceOperationsData.mockReset();
    requireFinanceContext.mockReset();
    screenSpy.mockReset();
    getFinanceOperationsData.mockResolvedValue({
      rentGenerationExceptions: [],
      tenantInvoices: [],
    });
  });

  it.each([
    ["finance_manager", FinancePage, "work"],
    ["finance_member", RentIncomePage, "rent"],
  ] as const)(
    "admits %s through finance context with read-only rent controls",
    async (role, page, view) => {
      requireFinanceContext.mockResolvedValue({
        capabilities: { canConfigureLeases: false },
        organizationId: "organization-1",
        organizationName: "Nestory Test",
        role,
      });

      const html = renderToStaticMarkup(await page());

      expect(html).toContain("Finance route");
      expect(requireFinanceContext).toHaveBeenCalledOnce();
      expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1");
      expect(screenSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          canConfigureRent: false,
          canRecoverRent: false,
          view,
        }),
      );
    },
  );

  it("passes Super Admin rent recovery authority explicitly", async () => {
    requireFinanceContext.mockResolvedValue({
      capabilities: { canConfigureLeases: true },
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "super_admin",
    });

    renderToStaticMarkup(await FinancePage());

    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canConfigureRent: true,
        canRecoverRent: true,
      }),
    );
  });
});
