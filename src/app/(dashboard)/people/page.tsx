import { PeopleModulePage } from "@/features/people/components/people-module-page";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function PeoplePage({ searchParams }: PeoplePageProps) {
  return (
    <PeopleModulePage
      config={{
        addButtonLabel: "Add person",
        description:
          "Operational people, company, tenant, owner, vendor, and staff records linked back to the work they support.",
        searchPlaceholder: "Search name, contact, role, lease, or property",
        title: "People",
      }}
      searchParams={searchParams}
    />
  );
}
