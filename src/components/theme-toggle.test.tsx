/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDisplayThemeStorageKey } from "@/components/theme-runtime";
import { ThemeToggle } from "@/components/theme-toggle";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  document.documentElement.dataset.theme = "light";
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("stores a personal mode without mutating organization appearance", async () => {
    const user = userEvent.setup();
    render(
      <ThemeToggle
        organizationId="org-1"
        theme={{ accentPreset: "ocean", accentSeed: null, mode: "system" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Display theme" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(getDisplayThemeStorageKey("org-1"))).toBe("dark");
    expect(localStorage.getItem("nestory-theme:org-1")).toBeNull();
  });

  it("offers system, light, and dark to every operator", async () => {
    const user = userEvent.setup();
    render(
      <ThemeToggle
        organizationId="org-1"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "light" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Display theme" }));

    expect(await screen.findByRole("menuitemradio", { name: "System" })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeTruthy();
  });
});
