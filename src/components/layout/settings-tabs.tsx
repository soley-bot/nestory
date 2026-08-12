"use client";

import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";

/**
 * Every settings destination in one row. Workspace previously split these
 * across two identically-styled segmented controls — a top tab row and a
 * 180px left rail — which read as one control cut in half.
 */
const settingsDestinations = [
  { href: "/settings?section=organization", label: "Organization" },
  { href: "/settings?section=appearance", label: "Appearance" },
  { href: "/settings?section=configuration", label: "Configuration" },
  { href: "/settings?section=branches", label: "Branches" },
  { href: "/settings?section=teams", label: "Teams" },
  { href: "/users-roles", label: "Workspace Access" },
  { href: "/settings/rent-policy", label: "Rent Policy" },
];

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  const navigationGuard = useSettingsNavigationGuard();
  const matchedIndex = settingsDestinations.findIndex(
    (destination) => destination.href === activeHref,
  );
  // A bare /settings lands on the first section.
  const activeIndex = matchedIndex === -1 ? 0 : matchedIndex;

  return (
    <LocalWorkspaceNav
      className="px-0 py-0 sm:px-0"
      items={settingsDestinations.map((destination, index) => ({
        active: index === activeIndex,
        href: destination.href,
        label: destination.label,
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
