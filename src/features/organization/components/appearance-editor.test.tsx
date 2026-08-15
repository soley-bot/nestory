/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  removeOrganizationLogoAction,
  updateOrganizationAppearanceAction,
  uploadOrganizationLogoAction,
} = vi.hoisted(() => ({
  removeOrganizationLogoAction: vi.fn(),
  updateOrganizationAppearanceAction: vi.fn(),
  uploadOrganizationLogoAction: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  removeOrganizationLogoAction,
  updateOrganizationAppearanceAction,
  uploadOrganizationLogoAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AppearanceEditor } from "@/features/organization/components/appearance-editor";
import { ORGANIZATION_THEME_UPDATED_EVENT } from "@/lib/theme/organization-theme";

afterEach(cleanup);

describe("AppearanceEditor", () => {
  const commonProps = {
    logoStoragePath: null,
    logoUrl: null,
    onDraftStatusChange: vi.fn(),
    organizationName: "Soley Property Management",
    theme: {
      accentPreset: "neutral",
      accentSeed: null,
      mode: "system",
    } as const,
  };

  it("offers a concise company-logo upload when no logo is set", () => {
    render(<AppearanceEditor {...commonProps} />);

    expect(screen.getByRole("heading", { name: "Company logo" })).toBeTruthy();
    expect(
      screen.getByLabelText("Company logo file").getAttribute("accept"),
    ).toBe("image/png,image/jpeg");
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeTruthy();
    expect(screen.getByText("PNG or JPEG, up to 2 MB.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove logo" })).toBeNull();
  });

  it("shows the current company logo with replace and remove controls", () => {
    render(
      <AppearanceEditor
        {...commonProps}
        logoStoragePath="organization-id/logos/logo.png"
        logoUrl="https://storage.test/company-logo"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Soley Property Management company logo",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace logo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove logo" })).toBeTruthy();
  });

  it("explains the personal display override once without repeated helper copy", () => {
    render(
      <AppearanceEditor
        logoStoragePath={null}
        logoUrl={null}
        onDraftStatusChange={vi.fn()}
        organizationName="Nestory Test"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      />,
    );

    expect(
      screen.getByText("Members can override this in their account."),
    ).toBeTruthy();
    expect(screen.queryByText(/Shared across the organization/)).toBeNull();
  });

  it("previews presets without mutating the document theme", () => {
    render(
      <AppearanceEditor
        logoStoragePath={null}
        logoUrl={null}
        onDraftStatusChange={vi.fn()}
        organizationName="Nestory Test"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));

    expect(
      screen
        .getByRole("button", { name: "Ocean" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("group", { name: "Appearance sample" }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("appearance-preview").getAttribute("style"),
    ).toContain("--org-accent-seed");
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it("shows inline validation for an invalid custom seed", async () => {
    render(
      <AppearanceEditor
        logoStoragePath={null}
        logoUrl={null}
        onDraftStatusChange={vi.fn()}
        organizationName="Nestory Test"
        theme={{ accentPreset: "neutral", accentSeed: null, mode: "system" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Custom hex color" }),
      {
        target: { value: "purple" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Enter a six-digit hex color."),
    ).toBeTruthy();
    expect(updateOrganizationAppearanceAction).not.toHaveBeenCalled();
  });

  it("restores the neutral system default in the draft", () => {
    render(
      <AppearanceEditor
        logoStoragePath={null}
        logoUrl={null}
        onDraftStatusChange={vi.fn()}
        organizationName="Nestory Test"
        theme={{ accentPreset: "plum", accentSeed: null, mode: "dark" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore default" }));

    expect(
      screen
        .getByRole("button", { name: "Neutral" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      (document.querySelector('input[name="mode"]') as HTMLInputElement).value,
    ).toBe("system");
  });

  it("synchronizes with the organization quick toggle", () => {
    render(
      <AppearanceEditor
        logoStoragePath={null}
        logoUrl={null}
        onDraftStatusChange={vi.fn()}
        organizationName="Nestory Test"
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

    expect(
      (document.querySelector('input[name="mode"]') as HTMLInputElement).value,
    ).toBe("dark");
    expect(
      screen
        .getByRole("button", { name: "Forest" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText("No changes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
