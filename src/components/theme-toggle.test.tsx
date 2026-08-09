/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateOrganizationAppearanceAction } = vi.hoisted(() => ({
  updateOrganizationAppearanceAction: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  updateOrganizationAppearanceAction,
}));

import { ThemeToggle } from "@/components/theme-toggle";

beforeEach(() => {
  updateOrganizationAppearanceAction.mockReset();
  updateOrganizationAppearanceAction.mockResolvedValue({
    message: "Appearance updated.",
    status: "success",
  });
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
  it("optimistically persists the organization mode while preserving accent", async () => {
    render(
      <ThemeToggle
        organizationId="org-1"
        theme={{ accentPreset: "ocean", accentSeed: null, mode: "system" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle color theme" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await waitFor(() => expect(updateOrganizationAppearanceAction).toHaveBeenCalledOnce());
    const submitted = updateOrganizationAppearanceAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("mode")).toBe("dark");
    expect(submitted.get("accentPreset")).toBe("ocean");
    expect(submitted.get("accentSeed")).toBe("");
  });

  it("rolls back an optimistic update when persistence fails", async () => {
    updateOrganizationAppearanceAction.mockResolvedValue({
      message: "Theme not updated.",
      status: "error",
    });
    render(
      <ThemeToggle
        organizationId="org-1"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "light" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle color theme" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Theme not updated.");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
