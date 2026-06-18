import { PeopleScreen } from "@/features/people/components/people-screen";
import { getPeopleScreenData } from "@/features/people/data/people";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import { requireAdminContext } from "@/lib/auth/context";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const context = await requireAdminContext();
  const viewQuery = parsePeopleSearchParams(await searchParams);
  const { pagination, people, schemaNotice } = await getPeopleScreenData(
    context.organizationId,
    viewQuery,
  );

  return (
    <PeopleScreen
      pagination={pagination}
      people={people}
      schemaNotice={schemaNotice}
      viewQuery={viewQuery}
    />
  );
}
