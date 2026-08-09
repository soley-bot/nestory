/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
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
  it("applies the server organization theme and scoped cache", () => {
    render(
      <ThemeRuntime
        organizationId="org-1"
        theme={{ accentPreset: "ocean", accentSeed: null, mode: "dark" }}
      >
        <span>Workspace</span>
      </ThemeRuntime>,
    );

    expect(screen.getByText("Workspace")).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("ocean");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("nestory-theme:org-1")).toContain(
      '"mode":"dark"',
    );
  });

  it("tracks system preference without creating a personal theme", () => {
    render(
      <ThemeRuntime
        organizationId="org-2"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      >
        <span>Workspace</span>
      </ThemeRuntime>,
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(media.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(localStorage.getItem("nestory-theme")).toBeNull();
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
  });
});
