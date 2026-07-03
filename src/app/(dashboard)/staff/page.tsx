import { PeopleModulePage } from "@/features/people/components/people-module-page";

type StaffPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function StaffPage({ searchParams }: StaffPageProps) {
  return (
    <PeopleModulePage
      config={{
        addButtonLabel: "Add staff",
        createRole: "staff",
        description:
          "Staff directory records for property management contacts and operating follow-up.",
        role: "staff",
        searchPlaceholder: "Search staff, contact, role, or operating note",
        showAccessStatus: true,
        title: "Staff",
      }}
      searchParams={searchParams}
    />
  );
}
