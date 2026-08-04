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
    ["admin", "/overview"],
    ["manager", "/maintenance"],
    ["member", "/tasks"],
  ] as const)("links %s users to their workspace entry", (role, href) => {
    render(<AppShell role={role}><div>Workspace content</div></AppShell>);
    const brandLink = screen.getByRole("link", { name: /Nestory/ });
    expect(brandLink.getAttribute("href")).toBe(href);
  });

  it("renders the eight admin destinations in the official sidebar menu", () => {
    render(<AppShell role="admin"><div>Workspace content</div></AppShell>);
    for (const label of ["Overview", "Properties", "People", "Finance", "Maintenance", "Records", "Reports", "Settings"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("uses the dashboard block quick-create action", () => {
    render(<AppShell role="admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("link", { name: "Quick Create" }).getAttribute("href")).toBe(
      "/properties?action=create",
    );
  });

  it("marks the matching destination active", () => {
    navigation.pathname = "/people/person-1";
    render(<AppShell role="admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("link", { name: /Current:\s*People/ }).closest('[data-active="true"]')).not.toBeNull();
  });

  it("keeps non-admin users out of admin destinations", () => {
    render(<AppShell role="manager"><div>Workspace content</div></AppShell>);
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Maintenance/ })).toBeTruthy();
  });

  it("keeps global search and routed content inside the sidebar inset", () => {
    render(<AppShell role="admin"><div>Workspace content</div></AppShell>);
    expect(screen.getByRole("button", { name: "Search or jump" })).toBeTruthy();
    expect(screen.getByText("Workspace content").closest('[data-slot="sidebar-inset"]')).not.toBeNull();
  });
});
