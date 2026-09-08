/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireFinanceReportContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => auth);
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("unexpected redirect");
  }),
}));

import ReportsPage from "@/app/(dashboard)/reports/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportsPage", () => {
  it("does not offer official statements to report-only staff without finance access", async () => {
    auth.requireFinanceReportContext.mockResolvedValue({
      organizationName: "Nestory",
      capabilities: { canReadFinance: false },
    });

    render(await ReportsPage());

    expect(screen.queryByRole("link", { name: /Official owner statements/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Owner activity/ }).getAttribute("href"))
      .toBe("/reports/monthly-owner-activity");
  });

  it("renders the two supported report builders as canonical links", async () => {
    auth.requireFinanceReportContext.mockResolvedValue({
      organizationName: "Nestory",
      capabilities: { canReadFinance: true },
    });

    render(await ReportsPage());

    expect(
      screen.getByRole("link", { name: /Owner activity/ }).getAttribute("href"),
    ).toBe("/reports/monthly-owner-activity");
    expect(
      screen.getByRole("link", { name: /Monthly Unit Profit & Loss/ }).getAttribute(
        "href",
      ),
    ).toBe("/reports/unit-profit-loss");
    expect(auth.requireFinanceReportContext).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /Official owner statements/ }).getAttribute("href"))
      .toBe("/balances?view=statements");
  });
});
