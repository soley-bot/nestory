/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

const navigation = vi.hoisted(() => ({ pathname: "/people" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auth/actions", () => ({ signOutAction: vi.fn() }));

beforeEach(() => {
  navigation.pathname = "/people";
});

afterEach(cleanup);

describe("AppShell Shadcn dashboard block", () => {
  it("keeps one vertical application scroll owner", () => {
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);

    const content = document.querySelector('[data-slot="app-shell-content"]');
    expect(content?.className).toContain("overflow-y-auto");
    expect(document.querySelectorAll('[data-scroll-owner="application"]')).toHaveLength(1);
    expect(content?.getAttribute("data-scroll-owner")).toBe("application");
  });

  it.each([
    ["super_admin", "/overview"],
    ["finance_manager", "/finance"],
    ["finance_member", "/finance"],
    ["operations_manager", "/maintenance"],
    ["operations_member", "/tasks"],
  ] as const)("links %s users to their workspace entry", (role, href) => {
    render(<AppShell role={role}><div>Workspace content</div></AppShell>);
    const brandLink = screen.getByRole("link", { name: /Nestory/ });
    expect(brandLink.getAttribute("href")).toBe(href);
  });

  it("renders the eight admin destinations in the official sidebar menu", () => {
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    for (const label of ["Dashboard", "Properties", "People", "Finance", "Maintenance", "Records", "Reports", "Settings"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("uses the dashboard block quick-create action", () => {
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("link", { name: "Quick Create" }).getAttribute("href")).toBe(
      "/properties?action=create",
    );
  });

  it("exposes deep Finance, Maintenance, and Records destinations from desktop domain groups", () => {
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);

    for (const domain of ["Finance", "Maintenance", "Records"]) {
      fireEvent.click(
        screen.getByRole("button", { name: `Expand ${domain} navigation` }),
      );
    }

    for (const label of [
      "Work queue",
      "Rent & collections",
      "Expenses",
      "Owner accounts",
      "Petty cash",
      "Ledger",
      "Cases",
      "My work",
      "Recurring work",
      "Inspections",
      "Work orders",
      "Timeline history",
      "Property timeline",
      "Maintenance timeline",
      "Financial timeline",
      "Documents",
      "Import",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }

    const financePages = screen.getByRole("list", { name: "Finance pages" });
    expect(
      within(financePages)
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
  });

  it("groups the Properties and People registers without repeating their domain labels", () => {
    navigation.pathname = "/overview";
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);

    for (const domain of ["Properties", "People"]) {
      fireEvent.click(
        screen.getByRole("button", { name: `Expand ${domain} navigation` }),
      );
    }

    for (const label of [
      "Register",
      "Units",
      "Leases",
      "Directory",
      "Tenants",
      "Owners",
      "Vendors",
      "Staff",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }

    expect(screen.getAllByRole("link", { name: "Properties" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "People" })).toHaveLength(1);
  });

  it("shows one selected state when the current page is inside an expanded domain", () => {
    navigation.pathname = "/properties";
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);

    const properties = screen.getByRole("link", { name: "Properties" });
    const register = screen.getByRole("link", { name: "Register" });

    expect(properties.closest('[data-active="true"]')).toBeNull();
    expect(properties.getAttribute("aria-current")).toBeNull();
    expect(register.closest('[data-active="true"]')).not.toBeNull();
    expect(register.getAttribute("aria-current")).toBe("page");
  });

  it("gives Finance Manager a review-first finance navigation", () => {
    navigation.pathname = "/finance";
    render(<AppShell role="finance_manager"><div>Workspace content</div></AppShell>);

    expect(screen.getByRole("link", { name: "Review queue" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ledger" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Petty cash" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Leases" }).getAttribute("href"),
    ).toBe("/leases");
    expect(screen.getByRole("link", { name: "Rent policy" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Timeline history" })).toBeNull();
  });

  it("limits Finance Member navigation to submission work", () => {
    navigation.pathname = "/finance";
    render(<AppShell role="finance_member"><div>Workspace content</div></AppShell>);

    expect(screen.getByRole("link", { name: "My submissions" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Expenses" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Petty cash" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ledger" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Leases" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Rent policy" })).toBeNull();
  });

  it("makes Reports discoverable only to the Finance Manager among non-admin roles", () => {
    const { rerender } = render(
      <AppShell role="finance_manager"><div>Workspace content</div></AppShell>,
    );
    expect(screen.getByRole("link", { name: /Reports/ }).getAttribute("href")).toBe(
      "/reports",
    );

    rerender(<AppShell role="finance_member"><div>Workspace content</div></AppShell>);
    expect(screen.queryByRole("link", { name: /Reports/ })).toBeNull();

    rerender(<AppShell role="operations_manager"><div>Workspace content</div></AppShell>);
    expect(screen.queryByRole("link", { name: /Reports/ })).toBeNull();
  });

  it("limits Operations Member deep navigation to My work", () => {
    navigation.pathname = "/tasks";
    render(<AppShell role="operations_member"><div>Workspace content</div></AppShell>);

    expect(screen.getByRole("link", { name: "My work" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Work orders" })).toBeNull();
  });

  it("expands the active domain and marks its child current", () => {
    navigation.pathname = "/ledger";
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);

    expect(
      screen
        .getByRole("button", { name: "Collapse Finance navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "Ledger" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it.each([
    ["/maintenance", "Cases"],
    ["/recurring-tasks", "Recurring work"],
    ["/inspections", "Inspections"],
    ["/work-orders", "Work orders"],
  ])("keeps Operations Manager navigation active on %s", (pathname, child) => {
    navigation.pathname = pathname;
    render(<AppShell role="operations_manager"><div>Workspace content</div></AppShell>);

    expect(
      screen
        .getByRole("button", { name: "Collapse Operations navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: child }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it.each([
    "super_admin",
    "finance_manager",
    "finance_member",
    "operations_manager",
    "operations_member",
  ] as const)("offers personal display theme control to %s", (role) => {
    const theme = { accentPreset: "neutral" as const, accentSeed: null, mode: "system" as const };
    render(
      <AppShell organizationId="org-1" role={role} theme={theme}>
        <div>Workspace content</div>
      </AppShell>,
    );
    expect(screen.getByRole("button", { name: "Display theme" })).toBeTruthy();
  });

  it("marks the matching child active without duplicating the group selected state", () => {
    navigation.pathname = "/people/person-1";
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    const people = screen.getByRole("link", { name: "People" });
    const directory = screen.getByRole("link", { name: "Directory" });

    expect(people.closest('[data-active="true"]')).toBeNull();
    expect(people.getAttribute("aria-current")).toBeNull();
    expect(directory.closest('[data-active="true"]')).not.toBeNull();
    expect(directory.getAttribute("aria-current")).toBe("page");
  });

  it("owns canonical Settings routes without treating Account as Settings", () => {
    navigation.pathname = "/settings/access";
    const { rerender } = render(
      <AppShell role="super_admin"><div>Workspace content</div></AppShell>,
    );
    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink.closest('[data-active="true"]')).not.toBeNull();

    navigation.pathname = "/account";
    rerender(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    expect(settingsLink.closest('[data-active="true"]')).toBeNull();
  });

  it("keeps non-admin users out of admin destinations", () => {
    render(<AppShell role="operations_manager"><div>Workspace content</div></AppShell>);
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Operations/ })).toBeTruthy();
  });

  it.each(["finance_manager", "finance_member"] as const)(
    "gives %s a Finance-only global destination",
    (role) => {
      render(<AppShell role={role}><div>Workspace content</div></AppShell>);

      expect(screen.getByRole("link", { name: /Finance/ }).getAttribute("href")).toBe(
        "/finance",
      );
      expect(screen.queryByRole("link", { name: /Maintenance/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
      expect(screen.queryByRole("link", { name: "Quick Create" })).toBeNull();
    },
  );

  it("gives Operations Manager a responsibility-led Operations domain", () => {
    navigation.pathname = "/maintenance";
    render(<AppShell role="operations_manager"><div>Workspace content</div></AppShell>);

    expect(screen.getByRole("link", { name: "Operations" }).getAttribute("href")).toBe(
      "/maintenance",
    );
    expect(screen.getByRole("link", { name: "Cases" })).toBeTruthy();
  });

  it("keeps global search and routed content inside the sidebar inset", () => {
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("button", { name: "Search or jump" })).toBeTruthy();
    expect(screen.getByText("Workspace content").closest('[data-slot="sidebar-inset"]')).not.toBeNull();
  });
});
