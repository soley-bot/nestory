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
    ]);
    expect(screen.queryByText("Configuration")).toBeNull();
  });

  it("keeps Finance Manager Settings empty after policy retirement", () => {
    render(
      <SettingsSectionNav
        activeHref="/settings/rent-policy"
        role="finance_manager"
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("uses the organization accent semantics for the active section", () => {
    render(
      <SettingsSectionNav
        activeHref="/settings/appearance"
        role="super_admin"
      />,
    );

    const active = screen.getByRole("link", { name: "Appearance" });
    expect(active.className).toContain("bg-[var(--org-accent-soft)]");
    expect(active.className).toContain("text-foreground");
    expect(active.className).not.toContain("bg-foreground");
  });
});
