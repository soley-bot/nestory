"use client";

import { useLayoutEffect, type ReactNode } from "react";

import {
  getOrganizationThemeStyle,
  type OrganizationTheme,
  type ResolvedThemeMode,
  type ThemeMode,
} from "@/lib/theme/organization-theme";

export const DISPLAY_THEME_UPDATED_EVENT = "nestory-display-theme-updated";

export function getDisplayThemeStorageKey(
  organizationId: string,
  userId?: string,
) {
  return `nestory-display-mode:${organizationId}${userId ? `:${userId}` : ""}`;
}

type ThemeRuntimeProps = {
  children: ReactNode;
  organizationId: string;
  theme: OrganizationTheme;
  userId: string;
};

export function ThemeRuntime({
  children,
  organizationId,
  theme,
  userId,
}: ThemeRuntimeProps) {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      applyOrganizationTheme(
        organizationId,
        theme,
        media.matches,
        readDisplayThemeMode(organizationId, userId),
      );
    const handleDisplayTheme = (event: Event) => {
      const detail = (
        event as CustomEvent<{ organizationId: string; userId?: string }>
      ).detail;
      if (
        detail?.organizationId === organizationId &&
        detail.userId === userId
      ) {
        apply();
      }
    };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener(DISPLAY_THEME_UPDATED_EVENT, handleDisplayTheme);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener(DISPLAY_THEME_UPDATED_EVENT, handleDisplayTheme);
    };
  }, [organizationId, theme, userId]);

  return children;
}

export function getThemeBootstrapScript(
  organizationId: string,
  theme: OrganizationTheme,
  userId?: string,
) {
  const payload = escapeScriptJson(
    JSON.stringify({
      organizationId,
      storageKey: getDisplayThemeStorageKey(organizationId, userId),
      styles: {
        dark: getOrganizationThemeStyle(theme, "dark"),
        light: getOrganizationThemeStyle(theme, "light"),
      },
      theme,
    }),
  );
  return `(() => {
    try {
      const payload = ${payload};
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const stored = window.localStorage.getItem(payload.storageKey);
      const requested = ["light", "dark", "system"].includes(stored) ? stored : payload.theme.mode;
      const resolved = requested === "system" ? (prefersDark ? "dark" : "light") : requested;
      const root = document.documentElement;
      root.dataset.theme = resolved;
      root.dataset.themePreference = requested;
      root.dataset.accent = payload.theme.accentPreset;
      root.classList.toggle("dark", resolved === "dark");
      Object.entries(payload.styles[resolved]).forEach(([name, value]) => root.style.setProperty(name, value));
    } catch {}
  })();`;
}

export function applyOrganizationTheme(
  organizationId: string,
  theme: OrganizationTheme,
  prefersDark: boolean,
  displayMode: ThemeMode | null = null,
) {
  const requested = displayMode ?? theme.mode;
  const resolved = requested === "system" ? (prefersDark ? "dark" : "light") : requested;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = requested;
  root.dataset.accent = theme.accentPreset;
  root.classList.toggle("dark", resolved === "dark");
  setThemeStyle(root, getOrganizationThemeStyle(theme, resolved));
}

export function setPersonalDisplayTheme(
  organizationId: string,
  theme: OrganizationTheme,
  mode: ThemeMode,
  userId?: string,
) {
  window.localStorage.setItem(
    getDisplayThemeStorageKey(organizationId, userId),
    mode,
  );
  applyOrganizationTheme(
    organizationId,
    theme,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
    mode,
  );
  window.dispatchEvent(
    new CustomEvent(DISPLAY_THEME_UPDATED_EVENT, {
      detail: { organizationId, mode, userId },
    }),
  );
}

export function readDisplayThemeMode(
  organizationId: string,
  userId?: string,
): ThemeMode | null {
  const stored = window.localStorage.getItem(
    getDisplayThemeStorageKey(organizationId, userId),
  );
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : null;
}

function setThemeStyle(
  root: HTMLElement,
  style: ReturnType<typeof getOrganizationThemeStyle>,
) {
  for (const [name, value] of Object.entries(style)) {
    root.style.setProperty(name, value);
  }
}

function escapeScriptJson(value: string) {
  return value
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export type { ResolvedThemeMode };
