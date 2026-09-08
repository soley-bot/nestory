/* @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireFinanceContext: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: mocks.requireFinanceContext }));

import AdvancedFinancePage from "@/app/(dashboard)/finance/advanced/page";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("Advanced Finance discoverability", () => {
  it.each([
    { canCorrectFinance: true, canLockFinancialMonth: false },
    { canCorrectFinance: false, canLockFinancialMonth: true },
    { canCorrectFinance: false, canLockFinancialMonth: false },
  ])("shows a desktop Chart entry to an authorized Advanced reader %j", async (capabilities) => {
    mocks.requireFinanceContext.mockResolvedValue({ capabilities });
    const { container } = render(await AdvancedFinancePage());
    const body = container.querySelector('[data-slot="workspace-body"]') as HTMLElement;
    const chart = within(body).getByRole("link", { name: /Chart of Accounts/ });
    expect(chart.getAttribute("href")).toBe("/finance/accounts");
    expect(chart.closest(".md\\:hidden")).toBeNull();
    expect(screen.getByRole("heading", { name: "Advanced finance" })).toBeTruthy();
  });

  it("retains the Finance read boundary for non-finance users", async () => {
    mocks.requireFinanceContext.mockRejectedValue(new Error("redirect:/no-access"));
    await expect(AdvancedFinancePage()).rejects.toThrow("redirect:/no-access");
  });
});
