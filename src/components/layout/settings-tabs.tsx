"use client";

import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";
import { getSettingsDestinations } from "@/features/organization/settings-navigation";
import type { WorkspaceRole } from "@/lib/auth/capabilities";

/**
 * Every settings destination in one row. Workspace previously split these
 * across two identically-styled segmented controls — a top tab row and a
 * 180px left rail — which read as one control cut in half.
 */
export function SettingsTabs({
  activeHref,
  role = "super_admin",
}: {
  activeHref: string;
  role?: WorkspaceRole;
}) {
  const navigationGuard = useSettingsNavigationGuard();
  const settingsDestinations = getSettingsDestinations(role);
  const workspaceHref = settingsDestinations.find(
    (destination) => destination.group === "workspace",
  )?.href;
  const groups = [
    ...(workspaceHref
      ? [{ href: workspaceHref, label: "Workspace", value: "workspace" }]
      : []),
    ...(settingsDestinations.some((destination) => destination.group === "access")
      ? [{ href: "/settings/access", label: "Access", value: "access" }]
      : []),
  ];
  const activeGroup = activeHref.startsWith("/settings/access")
    ? "access"
    : "workspace";

  return (
    <LocalWorkspaceNav
      className="px-0 py-0 sm:px-0"
      items={groups.map((group) => ({
        active: group.value === activeGroup,
        href: group.href,
        label: group.label,
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
