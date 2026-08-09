/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    for (const label of ["Overview", "Properties", "People", "Finance", "Maintenance", "Records", "Reports", "Settings"]) {
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
      "Finance work",
      "Rent",
      "Expenses",
      "Owner balances",
      "Leases",
      "Ledger",
      "Petty cash",
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
  });

  it.each(["finance_manager", "finance_member"] as const)(
    "limits %s deep navigation to Finance",
    (role) => {
      navigation.pathname = "/finance";
      render(<AppShell role={role}><div>Workspace content</div></AppShell>);

      expect(screen.getByRole("link", { name: "Finance work" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Ledger" })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Timeline history" })).toBeNull();
    },
  );

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

  it("shows organization theme control only to the Super Admin", () => {
    const theme = { accentPreset: "neutral" as const, accentSeed: null, mode: "system" as const };
    const { rerender } = render(
      <AppShell organizationId="org-1" role="super_admin" theme={theme}>
        <div>Workspace content</div>
      </AppShell>,
    );
    expect(screen.getByRole("button", { name: "Toggle color theme" })).toBeTruthy();

    rerender(
      <AppShell organizationId="org-1" role="finance_manager" theme={theme}>
        <div>Workspace content</div>
      </AppShell>,
    );
    expect(screen.queryByRole("button", { name: "Toggle color theme" })).toBeNull();
  });

  it("marks the matching destination active", () => {
    navigation.pathname = "/people/person-1";
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("link", { name: /Current:\s*People/ }).closest('[data-active="true"]')).not.toBeNull();
  });

  it("keeps non-admin users out of admin destinations", () => {
    render(<AppShell role="operations_manager"><div>Workspace content</div></AppShell>);
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Maintenance/ })).toBeTruthy();
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

  it("keeps global search and routed content inside the sidebar inset", () => {
    render(<AppShell role="super_admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("button", { name: "Search or jump" })).toBeTruthy();
    expect(screen.getByText("Workspace content").closest('[data-slot="sidebar-inset"]')).not.toBeNull();
  });
});
