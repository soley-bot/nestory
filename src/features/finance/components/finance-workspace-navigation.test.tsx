/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";

afterEach(cleanup);

describe("FinanceWorkspaceNavigation", () => {
  it("remains a complete mobile fallback and stays hidden on desktop", () => {
    render(<FinanceWorkspaceNavigation activeRoute="/ledger" />);

    const navigation = screen.getByRole("navigation", {
      name: "Finance workspace",
    });
    expect(navigation.className).toContain("md:hidden");

    for (const label of [
      "Work queue",
      "Rent & collections",
      "Expenses",
      "Owner accounts",
      "Petty cash",
      "Ledger",
    ]) {
      expect(within(navigation).getByRole("link", { name: label })).toBeTruthy();
    }
    expect(within(navigation).queryByRole("link", { name: "Leases" })).toBeNull();
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Work queue",
      "Rent & collections",
      "Expenses",
      "Owner accounts",
      "Petty cash",
      "Ledger",
    ]);
    expect(
      within(navigation).getByRole("link", { name: "Ledger" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
  });

  it("adds the mobile Reports destination only when report authority is present", () => {
    const { rerender } = render(
      <FinanceWorkspaceNavigation
        activeRoute="/ledger"
        canReadFinanceReports
      />,
    );
    const navigation = screen.getByRole("navigation", { name: "Finance workspace" });
    expect(within(navigation).getByRole("link", { name: "Reports" })).toBeTruthy();

    rerender(
      <FinanceWorkspaceNavigation
        activeRoute="/ledger"
        canReadFinanceReports={false}
      />,
    );
    expect(within(navigation).queryByRole("link", { name: "Reports" })).toBeNull();
  });

  it("keeps the Finance Member mobile fallback focused on submissions", () => {
    render(
      <FinanceWorkspaceNavigation
        activeRoute="/finance"
        role="finance_member"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Finance workspace",
    });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["My submissions", "Expenses"]);
    expect(within(navigation).queryByRole("link", { name: "Petty cash" })).toBeNull();
  });
});
