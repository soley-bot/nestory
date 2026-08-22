import type { WorkspaceRole, WorkspaceRoleKind } from "@/lib/auth/capabilities";

type SettingsRole = WorkspaceRole | WorkspaceRoleKind;

export type SettingsDestination = {
  group: "access" | "workspace";
  href: string;
  label: string;
};

const SUPER_ADMIN_SETTINGS: SettingsDestination[] = [
  {
    group: "workspace",
    href: "/settings/organization",
    label: "Organization",
  },
  {
    group: "workspace",
    href: "/settings/appearance",
    label: "Appearance",
  },
  { group: "workspace", href: "/settings/branches", label: "Branches" },
  { group: "workspace", href: "/settings/teams", label: "Teams" },
  { group: "access", href: "/settings/access", label: "Access" },
  { group: "access", href: "/settings/roles", label: "Roles" },
];

export function getSettingsDestinations(
  role: SettingsRole,
): SettingsDestination[] {
  if (role === "super_admin") return SUPER_ADMIN_SETTINGS;
  return [];
}

export function getSettingsLandingHref(role: SettingsRole): string | null {
  return getSettingsDestinations(role)[0]?.href ?? null;
}
