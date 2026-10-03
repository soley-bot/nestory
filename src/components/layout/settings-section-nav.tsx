"use client";

import Link from "next/link";
import { Building2, Landmark, Palette, ShieldCheck, UsersRound, UserRound } from "lucide-react";
import { useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";
import { getSettingsDestinations, SETTINGS_GROUPS } from "@/features/organization/settings-navigation";
import type { WorkspaceRole, WorkspaceRoleKind } from "@/lib/auth/capabilities";
import { cn } from "@/lib/utils";

const iconByHref = {
  "/settings/appearance": Palette,
  "/settings/branches": Building2,
  "/settings/organization": Landmark,
  "/settings/teams": UsersRound,
  "/settings/access": UserRound,
  "/settings/roles": ShieldCheck,
} as const;

export function SettingsSectionNav({ activeHref, role }: {
  activeHref: string;
  role: WorkspaceRole | WorkspaceRoleKind;
}) {
  const guard = useSettingsNavigationGuard();
  const destinations = getSettingsDestinations(role);
  return (
    <nav aria-label="Settings sections" className="grid min-w-0 grid-cols-3 gap-1 border-b pb-3 lg:grid-cols-1 lg:gap-5 lg:border-b-0 lg:pb-0">
      {SETTINGS_GROUPS.map((group) => {
        const items = destinations.filter((item) => (group.hrefs as readonly string[]).includes(item.href));
        if (!items.length) return null;
        return (
          <div aria-label={group.label} className="min-w-0" key={group.label} role="group">
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground lg:px-3">{group.label}</p>
            {items.map((item) => {
              const Icon = iconByHref[item.href as keyof typeof iconByHref];
              const active = item.href === activeHref;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 lg:min-h-9 lg:px-3",
                    active ? "bg-[var(--org-accent-soft)] text-foreground ring-1 ring-primary/20 [&_svg]:text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={(event) => guard?.handleNavigationClick(event, item)}
                >
                  {Icon ? <Icon aria-hidden="true" className="hidden size-4 shrink-0 lg:block" /> : null}
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
