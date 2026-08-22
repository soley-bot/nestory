import { PersonDetailScreen } from "@/features/people/components/person-detail-screen";
import { getAccessByPersonId } from "@/features/organization/data";
import { getPersonDetail } from "@/features/people/data/people";
import { requirePermission } from "@/lib/auth/context";
import PersonNotFound from "./not-found";

type PersonPageProps = {
  params: Promise<{ personId: string }>;
};

export default async function PersonPage({ params }: PersonPageProps) {
  const { personId } = await params;
  const context = await requirePermission("people.view");
  const person = await getPersonDetail(context.organizationId, personId);

  if (!person) {
    return <PersonNotFound />;
  }

  const isActiveStaff =
    !person.isArchived &&
    person.roles.some(
      (role) => role.role === "staff" && role.status === "active",
    );
  const accessByPersonId = context.isSuperAdmin && isActiveStaff
    ? await getAccessByPersonId(context.organizationId, [person.id])
    : undefined;

  return (
    <PersonDetailScreen
      accessStatus={accessByPersonId?.[person.id]}
      canArchive={context.permissionKeys.has("people.archive")}
      canEdit={context.permissionKeys.has("people.write")}
      person={person}
    />
  );
}
