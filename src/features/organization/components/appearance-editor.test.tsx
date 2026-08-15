/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { updateOrganizationAppearanceAction } = vi.hoisted(() => ({
  updateOrganizationAppearanceAction: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  updateOrganizationAppearanceAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AppearanceEditor } from "@/features/organization/components/appearance-editor";
import { ORGANIZATION_THEME_UPDATED_EVENT } from "@/lib/theme/organization-theme";

afterEach(cleanup);

describe("AppearanceEditor", () => {
  it("distinguishes the shared organization default from personal display mode", () => {
    render(
      <AppearanceEditor
        onDraftStatusChange={vi.fn()}
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      />,
    );

    expect(screen.getByText(/Sets the organization default/)).toBeTruthy();
    expect(screen.getByText(/Each member can choose a personal display mode/)).toBeTruthy();
    expect(screen.getByText(/Shared across the organization/)).toBeTruthy();
  });

  it("previews presets without mutating the document theme", () => {
    render(
      <AppearanceEditor
        onDraftStatusChange={vi.fn()}
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));

    expect(screen.getByRole("button", { name: "Ocean" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("appearance-preview").getAttribute("style")).toContain("--org-accent-seed");
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it("shows inline validation for an invalid custom seed", async () => {
    render(
      <AppearanceEditor
        onDraftStatusChange={vi.fn()}
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Custom hex color" }), {
      target: { value: "purple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a six-digit hex color.")).toBeTruthy();
    expect(updateOrganizationAppearanceAction).not.toHaveBeenCalled();
  });

  it("restores the neutral system default in the draft", () => {
    render(
      <AppearanceEditor
        onDraftStatusChange={vi.fn()}
        theme={{ accentPreset: "plum", accentSeed: null, mode: "dark" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore Nestory default" }));

    expect(screen.getByRole("button", { name: "Neutral" }).getAttribute("aria-pressed")).toBe("true");
    expect(
      (document.querySelector('input[name="mode"]') as HTMLInputElement).value,
    ).toBe("system");
  });

  it("synchronizes with the organization quick toggle", () => {
    render(
      <AppearanceEditor
        onDraftStatusChange={vi.fn()}
        theme={{ accentPreset: "forest", accentSeed: null, mode: "light" }}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(ORGANIZATION_THEME_UPDATED_EVENT, {
          detail: { accentPreset: "forest", accentSeed: null, mode: "dark" },
        }),
      );
    });

    expect((document.querySelector('input[name="mode"]') as HTMLInputElement).value).toBe("dark");
    expect(screen.getByRole("button", { name: "Forest" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("No changes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
