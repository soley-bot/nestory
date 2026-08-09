import { describe, expect, it } from "vitest";

import {
  ACCENT_PRESETS,
  DEFAULT_ORGANIZATION_THEME,
  contrastRatio,
  getOrganizationThemeStyle,
  normalizeHexColor,
  normalizeOrganizationTheme,
  resolveOrganizationTheme,
} from "@/lib/theme/organization-theme";

describe("organization theme", () => {
  it("keeps Nestory neutral and system-aware by default", () => {
    expect(DEFAULT_ORGANIZATION_THEME).toEqual({
      accentPreset: "neutral",
      accentSeed: null,
      mode: "system",
    });
    expect(ACCENT_PRESETS.neutral.seed).toBeNull();
    expect(resolveOrganizationTheme(DEFAULT_ORGANIZATION_THEME, true)).toBe(
      "dark",
    );
    expect(resolveOrganizationTheme(DEFAULT_ORGANIZATION_THEME, false)).toBe(
      "light",
    );
  });

  it("normalizes three- and six-digit hex colors", () => {
    expect(normalizeHexColor("  #2563eb ")).toBe("#2563EB");
    expect(normalizeHexColor("2563EB")).toBe("#2563EB");
    expect(normalizeHexColor("#abc")).toBe("#AABBCC");
    expect(normalizeHexColor("#12GG00")).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
  });

  it("falls back safely when persisted values are malformed", () => {
    expect(
      normalizeOrganizationTheme({
        accentPreset: "electric",
        accentSeed: "javascript:alert(1)",
        mode: "midnight",
      }),
    ).toEqual(DEFAULT_ORGANIZATION_THEME);

    expect(
      normalizeOrganizationTheme({
        accentPreset: "forest",
        accentSeed: "#FFFFFF",
        mode: "dark",
      }),
    ).toEqual({ accentPreset: "forest", accentSeed: null, mode: "dark" });
  });

  it("derives accessible light and dark custom accents", () => {
    const theme = {
      accentPreset: "custom" as const,
      accentSeed: "#2563EB",
      mode: "dark" as const,
    };
    const dark = getOrganizationThemeStyle(theme, "dark");
    const light = getOrganizationThemeStyle(theme, "light");

    expect(dark["--org-accent-seed"]).toBe("#2563EB");
    expect(["#101313", "#FFFFFF"]).toContain(
      dark["--primary-foreground"],
    );
    expect(
      contrastRatio(dark["--primary"], dark["--primary-foreground"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(light["--primary"], light["--primary-foreground"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark["--ring"], "#101313")).toBeGreaterThanOrEqual(
      3,
    );
    expect(contrastRatio(light["--ring"], "#FFFFFF")).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("keeps neutral accents monochrome", () => {
    const style = getOrganizationThemeStyle(
      DEFAULT_ORGANIZATION_THEME,
      "dark",
    );

    expect(style["--org-accent-seed"]).toBe("#F1F4F2");
    expect(style["--primary"]).toBe("#F1F4F2");
    expect(style["--primary-foreground"]).toBe("#101313");
  });
});
