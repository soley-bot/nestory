"use client";

import { useLayoutEffect, type ReactNode } from "react";

import {
  getOrganizationThemeStyle,
  resolveOrganizationTheme,
  type OrganizationTheme,
  type ResolvedThemeMode,
} from "@/lib/theme/organization-theme";

type ThemeRuntimeProps = {
  children: ReactNode;
  organizationId: string;
  theme: OrganizationTheme;
};

export function ThemeRuntime({
  children,
  organizationId,
  theme,
}: ThemeRuntimeProps) {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(organizationId, theme, media.matches);
    apply();
    if (theme.mode !== "system") return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [organizationId, theme]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: getThemeBootstrapScript(organizationId, theme),
        }}
        suppressHydrationWarning
      />
      {children}
    </>
  );
}

export function getThemeBootstrapScript(
  organizationId: string,
  theme: OrganizationTheme,
) {
  const payload = escapeScriptJson(
    JSON.stringify({
      organizationId,
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
      const resolved = payload.theme.mode === "system" ? (prefersDark ? "dark" : "light") : payload.theme.mode;
      const root = document.documentElement;
      root.dataset.theme = resolved;
      root.dataset.accent = payload.theme.accentPreset;
      root.classList.toggle("dark", resolved === "dark");
      Object.entries(payload.styles[resolved]).forEach(([name, value]) => root.style.setProperty(name, value));
      window.localStorage.setItem("nestory-theme:" + payload.organizationId, JSON.stringify(payload.theme));
    } catch {}
  })();`;
}

function applyTheme(
  organizationId: string,
  theme: OrganizationTheme,
  prefersDark: boolean,
) {
  const resolved = resolveOrganizationTheme(theme, prefersDark);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = theme.accentPreset;
  root.classList.toggle("dark", resolved === "dark");
  setThemeStyle(root, getOrganizationThemeStyle(theme, resolved));
  window.localStorage.setItem(
    `nestory-theme:${organizationId}`,
    JSON.stringify(theme),
  );
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
