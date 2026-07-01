import { PeopleModulePage } from "@/features/people/components/people-module-page";

type VendorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function VendorsPage({ searchParams }: VendorsPageProps) {
  return (
    <PeopleModulePage
      config={{
        addButtonLabel: "Add vendor",
        createRole: "vendor",
        description:
          "Vendor records with service category, contact readiness, maintenance links, and evidence.",
        role: "vendor",
        searchPlaceholder: "Search vendor, service, contact, or property",
        title: "Vendors",
      }}
      searchParams={searchParams}
    />
  );
}
