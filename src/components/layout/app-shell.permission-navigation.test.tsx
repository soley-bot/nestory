/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

const navigation = vi.hoisted(() => ({ pathname: "/finance" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auth/actions", () => ({ signOutAction: vi.fn() }));

beforeEach(() => {
  navigation.pathname = "/finance";
});

afterEach(cleanup);

describe("permission-first AppShell navigation", () => {
  it.each([
    { permissions: ["properties.view"], paths: ["/property-timeline", "/documents"] },
    { permissions: ["maintenance.view"], paths: ["/maintenance-timeline"] },
    { permissions: ["finance.view"], paths: ["/financial-timeline"] },
    { permissions: ["properties.view", "maintenance.view", "finance.view"], paths: ["/property-timeline", "/maintenance-timeline", "/financial-timeline", "/documents"] },
  ])("makes only permitted Records destinations discoverable for $permissions", ({ permissions, paths }) => {
    render(<AppShell permissionKeys={permissions as PermissionKey[]} roleKind="custom" roleName="Scoped reader"><div>Content</div></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Global navigation" });
    expect(within(nav).getByRole("link", { name: "Records" }).getAttribute("href")).toBe(paths[0]);
    fireEvent.click(screen.getByRole("button", { name: "Expand Records navigation" }));
    const recordPaths = ["/timeline", "/property-timeline", "/maintenance-timeline", "/financial-timeline", "/documents", "/import"];
    for (const path of recordPaths) {
      expect(nav.querySelector(`a[href="${path}"]`) !== null).toBe(paths.includes(path));
    }
  });

  it.each([{ permissions: [] }, { permissions: ["people.view"] }, { permissions: ["leases.view"] }])("omits Records without a matching read permission: $permissions", ({ permissions }) => {
    render(<AppShell permissionKeys={permissions as PermissionKey[]} roleKind="custom" roleName="Other reader"><div>Content</div></AppShell>);
    expect(screen.queryByRole("link", { name: "Records" })).toBeNull();
  });

  it("retains all Records destinations for Super Admin", () => {
    navigation.pathname = "/documents";
    render(<AppShell roleKind="super_admin"><div>Content</div></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Global navigation" });
    expect(within(nav).getByRole("link", { name: "Records" }).getAttribute("href")).toBe("/timeline");
    for (const path of ["/timeline", "/property-timeline", "/maintenance-timeline", "/financial-timeline", "/documents", "/import"]) {
      expect(nav.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
  });

  it.each(["Finance Manager", "Finance Member"])("keeps %s lease navigation out of the denied property register", (roleName) => {
    render(
      <AppShell permissionKeys={["leases.view", "finance.view"]} roleKind="custom" roleName={roleName}>
        <div>Workspace content</div>
      </AppShell>,
    );
    const globalNav = screen.getByRole("navigation", { name: "Global navigation" });
    expect(within(globalNav).getByRole("link", { name: "Properties" }).getAttribute("href")).toBe("/leases");
    fireEvent.click(screen.getByRole("button", { name: "Expand Properties navigation" }));
    expect(within(globalNav).getByRole("link", { name: "Leases" }).getAttribute("href")).toBe("/leases");
    expect(globalNav.querySelector('a[href="/properties"]')).toBeNull();
    expect(globalNav.querySelector('a[href="/units"]')).toBeNull();
  });

  it("retains the property register parent when property read authority exists", () => {
    render(
      <AppShell permissionKeys={["properties.view", "leases.view"]} roleKind="custom" roleName="Property Reader">
        <div>Workspace content</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Properties" }).getAttribute("href")).toBe("/properties");
  });

  it("shows only Finance navigation for a custom role with Finance view", () => {
    render(
      <AppShell
        permissionKeys={["finance.view", "finance.submit_expenses"]}
        roleKind="custom"
        roleName="Finance Contributor"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /Finance/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Properties/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /People/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Quick Create" })).toBeNull();
    expect(screen.getByText("Finance Contributor")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Advanced" }).getAttribute("href")).toBe("/finance/advanced");
  });

  it("keeps Advanced navigation available to Finance controllers", () => {
    render(
      <AppShell
        permissionKeys={["finance.view", "finance.correct_records"]}
        roleKind="custom"
        roleName="Finance Controller"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Advanced" })).toBeTruthy();
  });

  it("exposes permission-filtered workspace search to an ordinary role", () => {
    render(
      <AppShell
        permissionKeys={["people.view"]}
        roleKind="custom"
        roleName="People Reader"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: "Search or jump" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Advanced" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Rent & collections" })).toBeNull();
  });

  it("uses the permission-first workspace entry for a branch-scoped role", () => {
    render(
      <AppShell
        permissionKeys={["maintenance.view", "maintenance.complete"]}
        roleKind="custom"
        roleName="Caretaker"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: /Nestory/ }).getAttribute("href"),
    ).toBe("/tasks");
    expect(screen.getByRole("link", { name: /Maintenance/ })).toBeTruthy();
  });

  it("fails closed when a contained legacy ordinary role reaches the shell", () => {
    render(
      <AppShell role="finance_manager">
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: /Nestory/ }).getAttribute("href"),
    ).toBe("/no-access");
    expect(screen.queryByRole("link", { name: /Finance/ })).toBeNull();
  });

  it("fails closed when no resolved database-backed role reaches the shell", () => {
    render(
      <AppShell>
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", { name: /Nestory/ }).getAttribute("href"),
    ).toBe("/no-access");
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
  });
});
