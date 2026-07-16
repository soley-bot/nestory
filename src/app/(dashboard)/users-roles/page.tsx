import { PageHeader } from "@/components/layout/page-header";
import { AccessSettingsScreen } from "@/features/organization/components/access-settings-screen";
import { getAccessSettingsData } from "@/features/organization/data";
import { requireAdminContext } from "@/lib/auth/context";

type UsersRolesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersRolesPage({
  searchParams,
}: UsersRolesPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const data = await getAccessSettingsData(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Roles, scope, and staff links."
        title="Settings"
      />
      <AccessSettingsScreen
        branches={data.branches}
        currentUserId={context.userId}
        inviteDefaults={{
          email: readParam(params.email),
          personId: readParam(params.personId),
        }}
        members={data.members}
        people={data.staff}
      />
    </div>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
