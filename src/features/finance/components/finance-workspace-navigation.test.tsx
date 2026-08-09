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
      "Finance work",
      "Rent",
      "Expenses",
      "Owner Balance",
      "Leases",
      "Ledger",
      "Petty Cash",
    ]) {
      expect(within(navigation).getByRole("link", { name: label })).toBeTruthy();
    }
    expect(
      within(navigation).getByRole("link", { name: "Ledger" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
  });
});
