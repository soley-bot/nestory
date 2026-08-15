import type { WorkspaceRole } from "@/lib/auth/capabilities";

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
  {
    group: "workspace",
    href: "/settings/rent-policy",
    label: "Rent policy",
  },
  { group: "access", href: "/settings/access", label: "Access" },
];

const RENT_POLICY_SETTINGS: SettingsDestination[] = [
  {
    group: "workspace",
    href: "/settings/rent-policy",
    label: "Rent policy",
  },
];

export function getSettingsDestinations(
  role: WorkspaceRole,
): SettingsDestination[] {
  if (role === "super_admin") return SUPER_ADMIN_SETTINGS;
  if (role === "finance_manager") return RENT_POLICY_SETTINGS;
  return [];
}

export function getSettingsLandingHref(role: WorkspaceRole): string | null {
  return getSettingsDestinations(role)[0]?.href ?? null;
}
