/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDisplayThemeStorageKey,
  getThemeBootstrapScript,
  ThemeRuntime,
} from "@/components/theme-runtime";

const media = {
  addEventListener: vi.fn(),
  matches: true,
  removeEventListener: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeRuntime", () => {
  it("does not reuse another user's display preference in the same organization", () => {
    localStorage.setItem(
      getDisplayThemeStorageKey("org-1", "user-a"),
      "dark",
    );

    render(
      <ThemeRuntime
        organizationId="org-1"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "light" }}
        userId="user-b"
      >
        <span>Workspace</span>
      </ThemeRuntime>,
    );

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(
      localStorage.getItem(getDisplayThemeStorageKey("org-1", "user-a")),
    ).toBe("dark");
    expect(
      localStorage.getItem(getDisplayThemeStorageKey("org-1", "user-b")),
    ).toBeNull();
  });

  it("uses a personal display preference without replacing the organization accent", () => {
    localStorage.setItem(
      getDisplayThemeStorageKey("org-1", "user-1"),
      "dark",
    );
    const { container } = render(
      <ThemeRuntime
        organizationId="org-1"
        theme={{ accentPreset: "ocean", accentSeed: null, mode: "light" }}
        userId="user-1"
      >
        <span>Workspace</span>
      </ThemeRuntime>,
    );

    expect(screen.getByText("Workspace")).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("ocean");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      localStorage.getItem(getDisplayThemeStorageKey("org-1", "user-1")),
    ).toBe("dark");
    expect(localStorage.getItem("nestory-theme:org-1")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("tracks system preference without creating a personal theme", () => {
    render(
      <ThemeRuntime
        organizationId="org-2"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
        userId="user-2"
      >
        <span>Workspace</span>
      </ThemeRuntime>,
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(media.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(
      localStorage.getItem(getDisplayThemeStorageKey("org-2", "user-2")),
    ).toBeNull();
  });

  it("serializes bootstrap data without allowing script termination", () => {
    const script = getThemeBootstrapScript("org-<script>", {
      accentPreset: "custom",
      accentSeed: "#2563EB",
      mode: "light",
    });

    expect(script).not.toContain("org-<script>");
    expect(script).toContain('"organizationId":"org-\\u003cscript\\u003e"');
    expect(script).not.toContain("</script>");
    expect(script).toContain("nestory-display-mode:org-");
  });
});
