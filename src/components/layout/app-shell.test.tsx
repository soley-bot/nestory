/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
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
