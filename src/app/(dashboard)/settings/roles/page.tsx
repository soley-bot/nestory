import { SettingsShell } from "@/components/layout/settings-shell";
import { RoleSettingsScreen } from "@/features/organization/components/role-settings-screen";
import {
  getAccessSettingsData,
  getOrganizationRolesData,
} from "@/features/organization/data";
import { requireSuperAdminContext } from "@/lib/auth/context";

export default async function RolesSettingsPage() {
  const context = await requireSuperAdminContext();
  const [roles, access] = await Promise.all([
    getOrganizationRolesData(context.organizationId),
    getAccessSettingsData(context.organizationId),
  ]);
  const superAdminUserCount = access.members.filter(
    (member) => member.role === "super_admin",
  ).length;

  return (
    <SettingsShell activeHref="/settings/roles" role={context.role}>
      <RoleSettingsScreen
        roles={roles}
        superAdminUserCount={superAdminUserCount}
      />
    </SettingsShell>
  );
}
