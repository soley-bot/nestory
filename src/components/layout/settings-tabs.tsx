"use client";

import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";

const settingsTabs = [
  { href: "/settings", label: "Workspace" },
  { href: "/users-roles", label: "Workspace Access" },
  { href: "/settings/rent-policy", label: "Rent Policy" },
];

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  const navigationGuard = useSettingsNavigationGuard();
  const activeIndex = settingsTabs.findIndex((tab) => tab.href === activeHref);
  const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;

  return (
    <LocalWorkspaceNav
      className="px-0 py-0 sm:px-0"
      items={settingsTabs.map((tab, index) => ({
        active: index === resolvedIndex,
        href: tab.href,
        label: tab.label,
      }))}
      label="Settings sections"
      onItemClick={(event, item) =>
        navigationGuard?.handleNavigationClick(event, {
          href: item.href,
          label: item.label,
        })
      }
    />
  );
}
