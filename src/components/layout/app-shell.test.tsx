/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsTabs } from "@/components/layout/settings-tabs";

const navigation = vi.hoisted(() => ({ pathname: "/tasks" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

beforeEach(() => {
  navigation.pathname = "/tasks";
});

afterEach(cleanup);

describe("AppShell workspace logo", () => {
  it.each([
    ["admin", "/overview"],
    ["manager", "/maintenance"],
    ["member", "/tasks"],
  ] as const)("links %s users to %s", (role, expectedPath) => {
    render(
      <AppShell role={role}>
        <div>Workspace</div>
      </AppShell>,
    );

    expect(
      screen
        .getByRole("link", { name: "NestoryWorkspace" })
        .getAttribute("href"),
    ).toBe(expectedPath);
  });

  it("keeps the collapsed manager logo on the manager entry route", () => {
    render(
      <AppShell role="manager">
        <div>Workspace</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(
      screen
        .getByRole("link", { name: "Nestory workspace" })
        .getAttribute("href"),
    ).toBe("/maintenance");
  });

  it("moves focus to the replacement sidebar toggle in both directions", () => {
    render(
      <AppShell role="admin">
        <div>Workspace</div>
      </AppShell>,
    );

    const collapseButton = screen.getByRole("button", {
      name: "Collapse sidebar",
    });
    collapseButton.focus();
    fireEvent.click(collapseButton);

    const expandButton = screen.getByRole("button", { name: "Expand sidebar" });
    expect(document.activeElement).toBe(expandButton);

    fireEvent.click(expandButton);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );
  });

  it("keeps managers out of admin-only settings navigation", () => {
    render(
      <AppShell role="manager">
        <div>Workspace</div>
      </AppShell>,
    );

    expect(screen.queryByRole("link", { name: "Organization" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });
});

describe("AppShell global navigation hierarchy", () => {
  const adminRoutes = [
    ["/overview", "Overview"],
    ["/properties", "Properties"],
    ["/properties/property-1", "Properties"],
    ["/units", "Properties"],
    ["/property-dashboard", "Properties"],
    ["/people", "People"],
    ["/people/person-1", "People"],
    ["/people-reports", "People"],
    ["/tenants", "People"],
    ["/owners", "People"],
    ["/vendors", "People"],
    ["/staff", "People"],
    ["/team", "People"],
    ["/rent-income", "Finance"],
    ["/bills-expenses", "Finance"],
    ["/leases", "Finance"],
    ["/ledger", "Finance"],
    ["/petty-cash", "Finance"],
    ["/payments", "Finance"],
    ["/invoices", "Finance"],
    ["/finance-dashboard", "Finance"],
    ["/maintenance", "Maintenance"],
    ["/tasks", "Maintenance"],
    ["/work-orders", "Maintenance"],
    ["/inspections", "Maintenance"],
    ["/recurring-tasks", "Maintenance"],
    ["/schedule", "Maintenance"],
    ["/maintenance-dashboard", "Maintenance"],
    ["/timeline", "Records"],
    ["/property-timeline", "Records"],
    ["/maintenance-timeline", "Records"],
    ["/financial-timeline", "Records"],
    ["/documents", "Records"],
    ["/import", "Records"],
    ["/reports", "Reports"],
    ["/reports/rent-roll", "Reports"],
    ["/settings", "Settings"],
    ["/users-roles", "Settings"],
    ["/account", "Settings"],
  ] as const;

  it("renders the eight admin destinations in operational order", () => {
    navigation.pathname = "/overview";
    render(
      <AppShell role="admin">
        <div>Workspace</div>
      </AppShell>,
    );

    const globalNavigation = screen.getByRole("navigation", {
      name: "Global navigation",
    });
    expect(
      within(globalNavigation)
        .getAllByRole("link")
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      "Overview",
      "Properties",
      "People",
      "Finance",
      "Maintenance",
      "Records",
      "Reports",
      "Settings",
    ]);
  });

  it.each(adminRoutes)(
    "maps %s to exactly one active %s destination",
    (pathname, expectedLabel) => {
      navigation.pathname = pathname;
      render(
        <AppShell role="admin">
          <div>Workspace</div>
        </AppShell>,
      );

      for (const label of ["Global navigation", "Global mobile navigation"]) {
        const globalNavigation = screen.getByRole("navigation", { name: label });
        const current = within(globalNavigation)
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page");

        expect(current).toHaveLength(1);
        expect(current[0]?.textContent?.trim()).toBe(expectedLabel);
      }
    },
  );

  it.each([
    ["manager", "/maintenance", "/maintenance"],
    ["manager", "/tasks", "/maintenance"],
    ["member", "/tasks", "/tasks"],
  ] as const)(
    "keeps the %s shell inside one Maintenance family on %s",
    (role, pathname, expectedHref) => {
      navigation.pathname = pathname;
      render(
        <AppShell role={role}>
          <div>Workspace</div>
        </AppShell>,
      );

      const globalNavigation = screen.getByRole("navigation", {
        name: "Global navigation",
      });
      const links = within(globalNavigation).getAllByRole("link");

      expect(links).toHaveLength(1);
      expect(links[0]?.textContent?.trim()).toBe("Maintenance");
      expect(links[0]?.getAttribute("href")).toBe(expectedHref);
      expect(links[0]?.getAttribute("aria-current")).toBe("page");
      expect(within(globalNavigation).queryByText("Settings")).toBeNull();
      expect(within(globalNavigation).queryByText("Properties")).toBeNull();
    },
  );

  it.each([
    "/maintenance",
    "/tasks",
    "/recurring-tasks",
    "/inspections",
    "/work-orders",
    "/schedule",
  ])("keeps one current member Maintenance family on %s", (pathname) => {
    navigation.pathname = pathname;
    render(
      <AppShell role="member">
        <div>Workspace</div>
      </AppShell>,
    );

    for (const label of ["Global navigation", "Global mobile navigation"]) {
      const globalNavigation = screen.getByRole("navigation", { name: label });
      const links = within(globalNavigation).getAllByRole("link");
      const current = links.filter(
        (link) => link.getAttribute("aria-current") === "page",
      );

      expect(links).toHaveLength(1);
      expect(current).toHaveLength(1);
      expect(current[0]?.textContent?.trim()).toBe("Maintenance");
      expect(current[0]?.getAttribute("href")).toBe("/tasks");
    }
  });

  it("keeps collapsed destinations named and ordered without group-toggle dead ends", () => {
    navigation.pathname = "/documents";
    render(
      <AppShell role="admin">
        <div>Workspace</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const collapsedNavigation = screen.getByRole("navigation", {
      name: "Collapsed global navigation",
    });
    const links = within(collapsedNavigation).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Overview",
      "Properties",
      "People",
      "Finance",
      "Maintenance",
      "Records",
      "Reports",
      "Settings",
    ]);
    expect(
      links.filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
    expect(within(collapsedNavigation).queryByRole("button")).toBeNull();
  });

  it("keeps expanded, collapsed, and mobile navigation in native tab order", () => {
    const { container } = render(
      <AppShell role="admin">
        <div>Workspace</div>
      </AppShell>,
    );

    expect(container.querySelector('[tabindex]:not([tabindex="0"])')).toBeNull();

    for (const label of ["Global navigation", "Global mobile navigation"]) {
      const navigationElement = screen.getByRole("navigation", { name: label });
      expect(
        within(navigationElement)
          .getAllByRole("link")
          .every((link) => !link.hasAttribute("tabindex")),
      ).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(
      within(
        screen.getByRole("navigation", { name: "Collapsed global navigation" }),
      )
        .getAllByRole("link")
        .every((link) => !link.hasAttribute("tabindex")),
    ).toBe(true);
  });

  it("leaves settings section links to the local settings navigation", () => {
    navigation.pathname = "/users-roles";
    render(
      <AppShell role="admin">
        <SettingsTabs activeHref="/users-roles" />
      </AppShell>,
    );

    const globalNavigation = screen.getByRole("navigation", {
      name: "Global navigation",
    });
    expect(within(globalNavigation).getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(within(globalNavigation).queryByRole("link", { name: "Organization" })).toBeNull();
    expect(within(globalNavigation).queryByRole("link", { name: "Users & Roles" })).toBeNull();

    const localNavigation = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    expect(
      within(localNavigation).getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Organization", "Users & Roles"]);
    expect(
      within(localNavigation)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });
});

describe("AppShell viewport contract", () => {
  it("renders one global Search or jump trigger across the authenticated shell", () => {
    render(
      <AppShell role="admin">
        <div>Workspace</div>
      </AppShell>,
    );

    expect(
      screen.getAllByRole("button", { name: "Search or jump" }),
    ).toHaveLength(1);
  });

  it("bounds authenticated content while preserving an internal legacy-page scroller", () => {
    const { container } = render(
      <AppShell>
        <div>Legacy page content</div>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    expect(main.className).toContain("h-dvh");
    expect(main.className).toContain("min-h-0");
    expect(main.className).toContain("flex");
    expect(main.className).toContain("flex-col");
    expect(main.className).toContain("overflow-hidden");

    const contentViewport = container.querySelector<HTMLElement>(
      '[data-slot="app-shell-content"]',
    );
    expect(contentViewport).not.toBeNull();
    expect(contentViewport?.className).toContain("min-h-0");
    expect(contentViewport?.className).toContain("min-w-0");
    expect(contentViewport?.className).toContain("flex-1");
    expect(contentViewport?.className).toContain("overflow-y-auto");
    expect(contentViewport?.contains(screen.getByText("Legacy page content"))).toBe(
      true,
    );
  });

  it("keeps the mobile header fixed in the flex stack and releases bounds for print", () => {
    const { container } = render(
      <AppShell>
        <div>Printable page</div>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    expect(main.className).toContain("print:h-auto");
    expect(main.className).toContain("print:overflow-visible");

    const mobileHeader = container.querySelector<HTMLElement>(
      '[data-slot="mobile-shell-header"]',
    );
    expect(mobileHeader).not.toBeNull();
    expect(mobileHeader?.className).toContain("shrink-0");
    expect(mobileHeader?.className).toContain("print:hidden");

    const contentViewport = container.querySelector<HTMLElement>(
      '[data-slot="app-shell-content"]',
    );
    expect(contentViewport?.className).toContain("print:overflow-visible");
  });
});
