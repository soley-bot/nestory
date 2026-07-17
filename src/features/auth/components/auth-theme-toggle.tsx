"use client";

import { Moon, Sun } from "lucide-react";

export function AuthThemeToggle() {
  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("nestory-theme", nextTheme);
  }

  return (
    <button
      aria-label="Toggle color theme"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--auth-page-subtle)] outline-none transition-colors hover:bg-[var(--auth-page-line)] hover:text-[var(--auth-page-fg)] focus-visible:ring-2 focus-visible:ring-focus-ring"
      onClick={toggleTheme}
      title="Toggle color theme"
      type="button"
    >
      <Moon className="theme-toggle-moon" size={17} strokeWidth={1.6} />
      <Sun className="theme-toggle-sun" size={17} strokeWidth={1.6} />
    </button>
  );
}
