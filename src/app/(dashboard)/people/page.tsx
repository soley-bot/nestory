import { PeopleScreen } from "@/features/people/components/people-screen";
import { getPeopleScreenData } from "@/features/people/data/people";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parsePeopleSearchParams(params);
  const { pagination, people, schemaNotice } = await getPeopleScreenData(
    context.organizationId,
    viewQuery,
  );
  const initialPersonId = getUuidSearchParam(params.personId);

  return (
    <PeopleScreen
      key={initialPersonId ?? "people"}
      initialPersonId={initialPersonId}
      pagination={pagination}
      people={people}
      schemaNotice={schemaNotice}
      viewQuery={viewQuery}
    />
  );
}
