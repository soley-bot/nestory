"use client";

import Link from "next/link";
import {
  Building2,
  Landmark,
  Palette,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import { useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";
import { getSettingsDestinations } from "@/features/organization/settings-navigation";
import type { WorkspaceRole } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

const iconByHref = {
  "/settings/appearance": Palette,
  "/settings/branches": Building2,
  "/settings/organization": Landmark,
  "/settings/rent-policy": ReceiptText,
  "/settings/teams": UsersRound,
} as const;

export function SettingsSectionNav({
  activeHref,
  role,
}: {
  activeHref: string;
  role: WorkspaceRole;
}) {
  const navigationGuard = useSettingsNavigationGuard();
  const destinations = getSettingsDestinations(role).filter(
    (destination) => destination.group === "workspace",
  );

  return (
    <nav
      aria-label="Workspace settings"
      className="min-w-0 overflow-x-auto lg:overflow-visible"
    >
      <div className="flex min-w-max gap-1 border-b border-border pb-2 lg:min-w-0 lg:flex-col lg:border-b-0 lg:pb-0">
        {destinations.map((destination) => {
          const Icon = iconByHref[destination.href as keyof typeof iconByHref];
          const active = destination.href === activeHref;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              href={destination.href}
              key={destination.href}
              onClick={(event) =>
                navigationGuard?.handleNavigationClick(event, destination)
              }
            >
              {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
              {destination.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
