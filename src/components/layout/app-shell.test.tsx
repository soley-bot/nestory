/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
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
