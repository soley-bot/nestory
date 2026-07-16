import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import type { PersonRoleValue } from "@/features/people/people.types";

export function PeopleWorkspaceNavigation({
  activeRole,
  reports = false,
}: {
  activeRole?: PersonRoleValue;
  reports?: boolean;
}) {
  return (
    <LocalWorkspaceNav
      items={[
        { active: !activeRole && !reports, href: "/people", label: "All" },
        {
          active: activeRole === "owner" && !reports,
          href: "/owners",
          label: "Owners",
        },
        {
          active: activeRole === "staff" && !reports,
          href: "/staff",
          label: "Staff",
        },
        {
          active: activeRole === "tenant" && !reports,
          href: "/tenants",
          label: "Tenants",
        },
        {
          active: activeRole === "vendor" && !reports,
          href: "/vendors",
          label: "Vendors",
        },
        { active: reports, href: "/people-reports", label: "Reports" },
      ]}
      label="People views"
    />
  );
}
