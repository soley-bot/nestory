/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "@/components/layout/settings-tabs";

afterEach(cleanup);

describe("SettingsTabs", () => {
  it.each(["/settings", "/users-roles", "/settings/rent-policy"])(
    "keeps exactly one current section for %s",
    (activeHref) => {
      render(<SettingsTabs activeHref={activeHref} />);

      const navigation = screen.getByRole("navigation", {
        name: "Settings sections",
      });
      const links = within(navigation).getAllByRole("link");
      const current = links.filter(
        (link) => link.getAttribute("aria-current") === "page",
      );

      expect(links.map((link) => link.textContent)).toEqual([
        "Workspace",
        "Workspace Access",
        "Rent Policy",
      ]);
      expect(current).toHaveLength(1);
      expect(current[0]?.getAttribute("href")).toBe(activeHref);
      expect(
        links.every((link) =>
          link.className.includes("focus-visible:ring-ring/50"),
        ),
      ).toBe(true);
    },
  );

  it("shares the page header row without recreating a full-width tab band", () => {
    render(
      <PageHeader
        navigation={<SettingsTabs activeHref="/settings" />}
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
