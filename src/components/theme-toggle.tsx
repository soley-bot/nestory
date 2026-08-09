"use client";

import { Moon, Sun } from "lucide-react";
import { useState, useTransition } from "react";

import { applyOrganizationTheme } from "@/components/theme-runtime";
import { updateOrganizationAppearanceAction } from "@/features/organization/actions";
import {
  ORGANIZATION_THEME_UPDATED_EVENT,
  type OrganizationTheme,
} from "@/lib/theme/organization-theme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  organizationId?: string;
  theme?: OrganizationTheme;
};

export function ThemeToggle({
  className,
  organizationId,
  theme,
}: ThemeToggleProps) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    if (!theme || !organizationId) {
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      return;
    }

    const next: OrganizationTheme = { ...theme, mode: nextTheme };
    applyOrganizationTheme(organizationId, next, nextTheme === "dark");
    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("mode", next.mode);
      formData.set("accentPreset", next.accentPreset);
      formData.set("accentSeed", next.accentSeed ?? "");
      const result = await updateOrganizationAppearanceAction({}, formData);
      if (result.status === "error") {
        applyOrganizationTheme(
          organizationId,
          theme,
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        );
        setError(result.message ?? "Theme not updated.");
        return;
      }
      applyOrganizationTheme(organizationId, next, nextTheme === "dark");
      window.dispatchEvent(
        new CustomEvent(ORGANIZATION_THEME_UPDATED_EVENT, { detail: next }),
      );
    });
  }

  return (
    <>
      <button
        aria-busy={pending}
        aria-label="Toggle color theme"
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        disabled={pending}
        onClick={toggleTheme}
        title="Toggle color theme"
        type="button"
      >
        <Moon className="theme-toggle-moon" size={17} strokeWidth={1.6} />
        <Sun className="theme-toggle-sun" size={17} strokeWidth={1.6} />
      </button>
      {error ? <span className="sr-only" role="alert">{error}</span> : null}
    </>
  );
}
