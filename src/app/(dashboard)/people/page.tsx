import { PeopleModulePage } from "@/features/people/components/people-module-page";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function PeoplePage({ searchParams }: PeoplePageProps) {
  return (
    <PeopleModulePage
      config={{
        addButtonLabel: "Add person",
        searchPlaceholder: "Search name, contact, role, lease, or property",
        showInsights: true,
        title: "People",
      }}
      searchParams={searchParams}
    />
  );
}
