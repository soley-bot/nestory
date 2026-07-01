import { PeopleModulePage } from "@/features/people/components/people-module-page";

type TenantsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TenantsPage({ searchParams }: TenantsPageProps) {
  return (
    <PeopleModulePage
      config={{
        addButtonLabel: "Add tenant",
        createRole: "tenant",
        description:
          "Tenant records with lease links, contact readiness, evidence, and follow-up actions.",
        role: "tenant",
        searchPlaceholder: "Search tenant, contact, lease, unit, or property",
        title: "Tenants",
      }}
      searchParams={searchParams}
    />
  );
}
