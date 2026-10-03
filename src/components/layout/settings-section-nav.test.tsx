/* @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsSectionNav } from "./settings-section-nav";
afterEach(cleanup);
describe("SettingsSectionNav", () => {
  it.each(["organization", "appearance", "branches", "teams", "access", "roles"])("shows one current destination and three groups for %s", (section) => {
    render(<SettingsSectionNav activeHref={`/settings/${section}`} role="super_admin" />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Organization", "Appearance", "Branches", "Teams", "Access", "Roles"]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href"))).toEqual([`/settings/${section}`]);
    expect(within(nav).getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual(["Company", "Structure", "Access"]);
    expect(links.every((link) => link.className.includes("min-h-11") && link.className.includes("focus-visible:ring-ring/50"))).toBe(true);
  });
  it.each(["finance_manager", "custom", undefined] as const)("fails closed for %s", (role) => {
    render(<SettingsSectionNav activeHref="/settings/organization" role={role as never} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("group")).toHaveLength(0);
  });
  it("uses organization accent semantics", () => {
    render(<SettingsSectionNav activeHref="/settings/appearance" role="super_admin" />);
    expect(screen.getByRole("link", { name: "Appearance" }).className).toContain("bg-[var(--org-accent-soft)]");
  });
});
