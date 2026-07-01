import { PageHeader } from "@/components/layout/page-header";
import { AccessSettingsScreen } from "@/features/organization/components/access-settings-screen";
import { getAccessSettingsData } from "@/features/organization/data";
import { requireAdminContext } from "@/lib/auth/context";

export default async function UsersRolesPage() {
  const context = await requireAdminContext();
  const data = await getAccessSettingsData(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Software access: admin, manager, and member permissions."
        title="Users & Roles"
      />
      <AccessSettingsScreen
        branches={data.branches}
        members={data.members}
        people={data.staff}
      />
    </div>
  );
}
