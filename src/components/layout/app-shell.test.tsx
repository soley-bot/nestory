/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

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
        .getByRole("link", { name: "NestoryDashboard" })
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
        .getByRole("link", { name: "Nestory dashboard" })
        .getAttribute("href"),
    ).toBe("/maintenance");
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
