import { PageHeader } from "@/components/layout/page-header";
import { buildAccessByPersonId } from "@/features/organization/access-status";
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
  const requestedPersonId = readUuidParam(params.personId);
  const requestedMemberId = readUuidParam(params.memberId);
  const requestedInvitationId = readUuidParam(params.invitationId);
  const selectedStaff = data.staff.find((person) => person.id === requestedPersonId);
  const selectedAccess = selectedStaff
    ? buildAccessByPersonId(
        [selectedStaff.id],
        data.members,
        data.invitations,
        new Date(),
        data.branches,
      )[selectedStaff.id]
    : undefined;
  const focusedMemberId = selectedStaff
    ? selectedAccess?.state === "active_workspace_access"
      ? selectedAccess.membershipId
      : undefined
    : data.members.some((member) => member.id === requestedMemberId)
      ? requestedMemberId
      : undefined;
  const focusedInvitationId = selectedStaff
    ? selectedAccess && "invitationId" in selectedAccess
      ? selectedAccess.invitationId
      : undefined
    : data.invitations.some((invitation) => invitation.id === requestedInvitationId)
      ? requestedInvitationId
      : undefined;
  const inviteDefaults = selectedStaff && selectedAccess?.state === "no_access"
    ? {
        email: selectedStaff.primaryEmail ?? "",
        personId: selectedStaff.id,
        staffEmail: selectedStaff.primaryEmail ?? undefined,
      }
    : undefined;

  return (
    <div>
      <PageHeader
        description="Invite Staff to sign in and manage existing workspace access."
        title="Workspace Access"
      />
      <AccessSettingsScreen
        branches={data.branches}
        currentUserId={context.userId}
        focusedInvitationId={focusedInvitationId}
        focusedMemberId={focusedMemberId}
        inviteDefaults={inviteDefaults}
        invitations={data.invitations}
        members={data.members}
        people={data.linkedPeople ?? data.staff}
        requestedStaffId={selectedStaff?.id}
      />
    </div>
  );
}

function readUuidParam(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return first && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(first)
    ? first
    : undefined;
}
