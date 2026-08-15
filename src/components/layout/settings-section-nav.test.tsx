/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsSectionNav } from "@/components/layout/settings-section-nav";

afterEach(cleanup);

describe("SettingsSectionNav", () => {
  it("renders the Super Admin workspace sections without the removed catalogue", () => {
    render(
      <SettingsSectionNav
        activeHref="/settings/organization"
        role="super_admin"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Workspace settings",
    });
    expect(
      within(navigation).getAllByRole("link").map((link) => link.textContent),
    ).toEqual([
      "Organization",
      "Appearance",
      "Branches",
      "Teams",
      "Rent policy",
    ]);
    expect(screen.queryByText("Configuration")).toBeNull();
  });

  it("renders only Rent policy for Finance Manager", () => {
    render(
      <SettingsSectionNav
        activeHref="/settings/rent-policy"
        role="finance_manager"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Rent policy" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
