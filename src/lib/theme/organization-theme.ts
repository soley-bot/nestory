import type { CSSProperties } from "react";

export const THEME_MODES = ["light", "dark", "system"] as const;
export const ORGANIZATION_THEME_UPDATED_EVENT = "nestory-organization-theme-updated";
export const ACCENT_PRESET_NAMES = [
  "neutral",
  "forest",
  "ocean",
  "indigo",
  "plum",
  "terracotta",
  "custom",
] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedThemeMode = Exclude<ThemeMode, "system">;
export type AccentPreset = (typeof ACCENT_PRESET_NAMES)[number];

export type OrganizationTheme = {
  accentPreset: AccentPreset;
  accentSeed: string | null;
  mode: ThemeMode;
};

export type OrganizationThemeStyle = CSSProperties &
  Record<
    | "--org-accent-seed"
    | "--org-accent-soft"
    | "--org-accent-hover"
    | "--accent"
    | "--accent-foreground"
    | "--primary"
    | "--primary-foreground"
    | "--ring"
    | "--sidebar-primary"
    | "--sidebar-primary-foreground"
    | "--sidebar-accent"
    | "--sidebar-accent-foreground"
    | "--table-header-bg"
    | "--table-row-hover"
    | "--table-row-selected"
    | "--table-row-selected-indicator",
    string
  >;

export const ACCENT_PRESETS: Record<
  AccentPreset,
  { label: string; seed: string | null }
> = {
  neutral: { label: "Neutral", seed: null },
  forest: { label: "Forest", seed: "#27765A" },
  ocean: { label: "Ocean", seed: "#176B87" },
  indigo: { label: "Indigo", seed: "#4F5FBF" },
  plum: { label: "Plum", seed: "#7A477E" },
  terracotta: { label: "Terracotta", seed: "#9B543E" },
  custom: { label: "Custom", seed: null },
};

export const DEFAULT_ORGANIZATION_THEME: OrganizationTheme = {
  accentPreset: "neutral",
  accentSeed: null,
  mode: "system",
};

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`.toUpperCase();
  }
  return /^[0-9a-f]{6}$/i.test(normalized)
    ? `#${normalized.toUpperCase()}`
    : null;
}

export function normalizeOrganizationTheme(value: {
  accentPreset?: unknown;
  accentSeed?: unknown;
  mode?: unknown;
}): OrganizationTheme {
  if (!isThemeMode(value.mode) || !isAccentPreset(value.accentPreset)) {
    return DEFAULT_ORGANIZATION_THEME;
  }
  if (value.accentPreset === "custom") {
    const accentSeed = normalizeHexColor(value.accentSeed);
    return accentSeed
      ? { accentPreset: "custom", accentSeed, mode: value.mode }
      : DEFAULT_ORGANIZATION_THEME;
  }
  return { accentPreset: value.accentPreset, accentSeed: null, mode: value.mode };
}

export function resolveOrganizationTheme(
  theme: OrganizationTheme,
  prefersDark: boolean,
): ResolvedThemeMode {
  return theme.mode === "system" ? (prefersDark ? "dark" : "light") : theme.mode;
}

export function getOrganizationThemeStyle(
  theme: OrganizationTheme,
  resolvedMode: ResolvedThemeMode = theme.mode === "dark" ? "dark" : "light",
): OrganizationThemeStyle {
  const normalized = normalizeOrganizationTheme(theme);
  const dark = resolvedMode === "dark";
  const seed =
    normalized.accentPreset === "neutral"
      ? dark
        ? "#F1F4F2"
        : "#171A19"
      : normalized.accentPreset === "custom"
        ? normalized.accentSeed!
        : ACCENT_PRESETS[normalized.accentPreset].seed!;
  const background = dark ? "#101313" : "#FFFFFF";
  const primary = ensureContrast(seed, background, 4.5);
  const foreground = chooseReadableForeground(primary, dark ? "#101313" : "#FFFFFF");
  const ring = ensureContrast(seed, background, 3);
  const soft = `color-mix(in oklch, ${seed} ${dark ? "18%" : "10%"}, ${background})`;
  const surfaceForeground = dark ? "#F1F4F2" : "#171A19";

  return {
    "--org-accent-seed": seed,
    "--org-accent-soft": soft,
    "--org-accent-hover": `color-mix(in oklch, ${primary} 86%, ${foreground})`,
    "--accent": soft,
    "--accent-foreground": surfaceForeground,
    "--primary": primary,
    "--primary-foreground": foreground,
    "--ring": ring,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-accent": soft,
    "--sidebar-accent-foreground": surfaceForeground,
    "--table-header-bg": "transparent",
    "--table-row-hover": `color-mix(in oklch, ${surfaceForeground} ${dark ? "10%" : "6%"}, ${background})`,
    "--table-row-selected": `color-mix(in oklch, ${surfaceForeground} ${dark ? "16%" : "10%"}, ${background})`,
    "--table-row-selected-indicator": primary,
  };
}

export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

function isAccentPreset(value: unknown): value is AccentPreset {
  return ACCENT_PRESET_NAMES.includes(value as AccentPreset);
}

function chooseReadableForeground(background: string, darkNeutral: string) {
  const options = [darkNeutral, "#FFFFFF"] as const;
  return options.reduce((best, option) =>
    contrastRatio(background, option) > contrastRatio(background, best)
      ? option
      : best,
  );
}

function ensureContrast(color: string, background: string, minimum: number) {
  if (contrastRatio(color, background) >= minimum) return color;
  const toward = relativeLuminance(background) < 0.5 ? "#FFFFFF" : "#000000";
  for (let amount = 0.08; amount <= 1; amount += 0.08) {
    const candidate = mixHex(color, toward, amount);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return toward;
}

function mixHex(first: string, second: string, amount: number) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return rgbToHex({
    b: Math.round(a.b + (b.b - a.b) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    r: Math.round(a.r + (b.r - a.r) * amount),
  });
}

function relativeLuminance(color: string) {
  const { r, g, b } = hexToRgb(color);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function hexToRgb(color: string) {
  const normalized = normalizeHexColor(color);
  if (!normalized) throw new Error(`Invalid hex color: ${color}`);
  return {
    b: Number.parseInt(normalized.slice(5, 7), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    r: Number.parseInt(normalized.slice(1, 3), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}
