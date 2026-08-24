"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

import {
  DISPLAY_THEME_UPDATED_EVENT,
  getDisplayThemeStorageKey,
  readDisplayThemeMode,
  setPersonalDisplayTheme,
} from "@/components/theme-runtime";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEFAULT_ORGANIZATION_THEME,
  type OrganizationTheme,
} from "@/lib/theme/organization-theme";

type ThemeToggleBaseProps = {
  className?: string;
};

type ThemeToggleProps = ThemeToggleBaseProps &
  (
    | {
        organizationId: string;
        theme: OrganizationTheme;
        userId: string;
      }
    | {
        organizationId?: undefined;
        theme?: undefined;
        userId?: undefined;
      }
  );

export function ThemeToggle({
  className,
  organizationId,
  theme,
  userId,
}: ThemeToggleProps) {
  const scope = organizationId ?? "public";
  const organizationTheme = theme ?? DEFAULT_ORGANIZATION_THEME;
  const subscribe = useCallback((notify: () => void) => {
    function handleDisplayTheme(event: Event) {
      const detail = (
        event as CustomEvent<{ organizationId?: string; userId?: string }>
      ).detail;
      if (
        detail?.organizationId === scope &&
        detail.userId === userId
      ) {
        notify();
      }
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === getDisplayThemeStorageKey(scope, userId)) notify();
    }
    window.addEventListener(DISPLAY_THEME_UPDATED_EVENT, handleDisplayTheme);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DISPLAY_THEME_UPDATED_EVENT, handleDisplayTheme);
      window.removeEventListener("storage", handleStorage);
    };
  }, [scope, userId]);
  const mode = useSyncExternalStore(
    subscribe,
    () => readDisplayThemeMode(scope, userId) ?? organizationTheme.mode,
    () => organizationTheme.mode,
  );

  function chooseMode(next: string) {
    if (next !== "system" && next !== "light" && next !== "dark") return;
    setPersonalDisplayTheme(scope, organizationTheme, next, userId);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Display theme"
          className={className}
          size="icon"
          title="Display theme"
          variant="ghost"
        >
          {mode === "system" ? <Monitor /> : mode === "dark" ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>Display theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={chooseMode} value={mode}>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
