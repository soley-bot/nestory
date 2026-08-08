/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => auth);
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("unexpected redirect");
  }),
}));

import ReportsPage from "@/app/(dashboard)/reports/page";

afterEach(cleanup);

describe("ReportsPage", () => {
  it("renders the two supported report builders as canonical links", async () => {
    auth.requireSuperAdminContext.mockResolvedValue({
      organizationName: "Nestory",
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
    expect(auth.requireSuperAdminContext).toHaveBeenCalledOnce();
  });
});
