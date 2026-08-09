"use client";

import Link from "next/link";
import { useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { href: "/settings", label: "Workspace" },
  { href: "/users-roles", label: "Workspace Access" },
  { href: "/settings/rent-policy", label: "Rent Policy" },
];

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  const navigationGuard = useSettingsNavigationGuard();
  const activeIndex = settingsTabs.findIndex((tab) => tab.href === activeHref);

  return (
    <nav aria-label="Settings sections" className="min-w-0 overflow-x-auto">
      <div className="inline-flex min-w-max items-center rounded-lg bg-muted p-0.5 text-muted-foreground">
        {settingsTabs.map((tab, index) => {
          const active = index === (activeIndex === -1 ? 0 : activeIndex);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-6 shrink-0 items-center rounded-md border border-transparent px-2.5 text-xs font-medium outline-none transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                active &&
                  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
              )}
              href={tab.href}
              key={tab.href}
              onClick={(event) =>
                navigationGuard?.handleNavigationClick(event, tab)
              }
              prefetch={false}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
