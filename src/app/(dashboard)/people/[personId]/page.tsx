import { notFound } from "next/navigation";
import { PersonDetailScreen } from "@/features/people/components/person-detail-screen";
import { getPersonDetail } from "@/features/people/data/people";
import { requireAdminContext } from "@/lib/auth/context";

type PersonPageProps = {
  params: Promise<{ personId: string }>;
};

export default async function PersonPage({ params }: PersonPageProps) {
  const { personId } = await params;
  const context = await requireAdminContext();
  const person = await getPersonDetail(context.organizationId, personId);

  if (!person) {
    notFound();
  }

  return <PersonDetailScreen person={person} />;
}
