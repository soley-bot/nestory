import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getLedgerScreenData,
  getPettyCashScreenData,
  ledgerScreenSpy,
  pettyCashScreenSpy,
  requireFinanceContext,
} = vi.hoisted(() => ({
  getLedgerScreenData: vi.fn(),
  getPettyCashScreenData: vi.fn(),
  ledgerScreenSpy: vi.fn(),
  pettyCashScreenSpy: vi.fn(),
  requireFinanceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/ledger/data/ledger", () => ({ getLedgerScreenData }));
vi.mock("@/features/petty-cash/data/petty-cash", () => ({
  getPettyCashScreenData,
}));
vi.mock("@/features/ledger/components/ledger-screen", () => ({
  LedgerScreen: (props: Record<string, unknown>) => {
    ledgerScreenSpy(props);
    return <div>Ledger route</div>;
  },
}));
vi.mock("@/features/petty-cash/components/petty-cash-screen", () => ({
  PettyCashScreen: (props: Record<string, unknown>) => {
    pettyCashScreenSpy(props);
    return <div>Petty cash route</div>;
  },
}));

import LedgerPage from "@/app/(dashboard)/ledger/page";
import PettyCashPage from "@/app/(dashboard)/petty-cash/page";

describe("Finance read routes", () => {
  beforeEach(() => {
    getLedgerScreenData.mockReset();
    getPettyCashScreenData.mockReset();
    ledgerScreenSpy.mockReset();
    pettyCashScreenSpy.mockReset();
    requireFinanceContext.mockReset();
    getLedgerScreenData.mockResolvedValue({ entries: [] });
    getPettyCashScreenData.mockResolvedValue({ entries: [] });
  });

  it.each([
    ["finance_manager", LedgerPage, ledgerScreenSpy, "Ledger route"],
    ["finance_member", PettyCashPage, pettyCashScreenSpy, "Petty cash route"],
  ] as const)(
    "admits %s to a mutation-free Finance surface",
    async (role, page, screenSpy, expectedText) => {
      requireFinanceContext.mockResolvedValue({
        capabilities: { canManageFinanceOperations: false },
        organizationId: "organization-1",
        role,
      });

      const html = renderToStaticMarkup(
        await page({ searchParams: Promise.resolve({}) }),
      );

      expect(html).toContain(expectedText);
      expect(requireFinanceContext).toHaveBeenCalledOnce();
      expect(screenSpy).toHaveBeenCalledWith(
        expect.objectContaining({ canManageFinance: false }),
      );
    },
  );

  it("keeps Super Admin mutation authority on both Finance read routes", async () => {
    requireFinanceContext.mockResolvedValue({
      capabilities: { canManageFinanceOperations: true },
      organizationId: "organization-1",
      role: "super_admin",
    });

    renderToStaticMarkup(
      await LedgerPage({ searchParams: Promise.resolve({}) }),
    );
    renderToStaticMarkup(
      await PettyCashPage({ searchParams: Promise.resolve({}) }),
    );

    expect(ledgerScreenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ canManageFinance: true }),
    );
    expect(pettyCashScreenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ canManageFinance: true }),
    );
  });
});
