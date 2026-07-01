import { PeopleModulePage } from "@/features/people/components/people-module-page";

type OwnersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function OwnersPage({ searchParams }: OwnersPageProps) {
  return (
    <PeopleModulePage
      config={{
        addButtonLabel: "Add owner",
        createRole: "owner",
        description:
          "Owner records with property links, contact readiness, documents, and reporting context.",
        role: "owner",
        searchPlaceholder: "Search owner, contact, property, or ownership note",
        title: "Owners",
      }}
      searchParams={searchParams}
    />
  );
}
