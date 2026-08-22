/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "@/components/layout/settings-tabs";

afterEach(cleanup);

describe("SettingsTabs", () => {
  it.each([
    "/settings/organization",
    "/settings/appearance",
    "/settings/branches",
    "/settings/teams",
    "/settings/access",
    "/settings/roles",
  ])("keeps exactly one current section for %s", (activeHref) => {
    render(<SettingsTabs activeHref={activeHref} role="super_admin" />);

    const navigation = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    const links = within(navigation).getAllByRole("link");
    const current = links.filter(
      (link) => link.getAttribute("aria-current") === "page",
    );

    expect(links.map((link) => link.textContent)).toEqual([
      "Workspace",
      "Access",
      "Roles",
    ]);
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe(
      activeHref === "/settings/access" || activeHref === "/settings/roles"
        ? activeHref
        : "/settings/organization",
    );
    expect(
      links.every((link) =>
        link.className.includes("focus-visible:ring-ring/50"),
      ),
    ).toBe(true);
  });

  it("does not expose an empty Settings group to Finance Manager", () => {
    render(
      <SettingsTabs
        activeHref="/settings/organization"
        role="finance_manager"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    expect(within(navigation).queryAllByRole("link")).toHaveLength(0);
  });

  it("fails closed when protected role context is absent", () => {
    render(
      <SettingsTabs
        activeHref="/settings/organization"
        role={undefined as never}
      />,
    );

    expect(
      within(
        screen.getByRole("navigation", { name: "Settings sections" }),
      ).queryAllByRole("link"),
    ).toHaveLength(0);
  });

  it("shares the page header row without recreating a full-width tab band", () => {
    render(
      <PageHeader
        navigation={
          <SettingsTabs
            activeHref="/settings/organization"
            role="super_admin"
          />
        }
        title="Settings"
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Settings",
    });
    const navigation = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    const navigationSlot = navigation.parentElement;

    expect(heading.closest("header")).toBe(navigation.closest("header"));
    expect(navigationSlot?.getAttribute("data-slot")).toBe(
      "page-header-navigation",
    );
    expect(navigationSlot?.parentElement?.getAttribute("data-slot")).toBe(
      "page-header-primary-row",
    );
    expect(navigationSlot?.className).not.toContain("mt-2");
    expect(navigation.className).toContain("overflow-x-auto");
    expect(navigation.className).not.toMatch(/(?:^|\s)border(?:-|\s|$)/);
    expect(navigation.className).not.toContain("bg-card");
  });
});
