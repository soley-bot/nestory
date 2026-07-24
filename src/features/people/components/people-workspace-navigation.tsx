import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import type { PersonRoleValue } from "@/features/people/people.types";

export function PeopleWorkspaceNavigation({
  activeRole,
}: {
  activeRole?: PersonRoleValue;
}) {
  return (
    <LocalWorkspaceNav
      items={[
        { active: !activeRole, href: "/people", label: "All" },
        {
          active: activeRole === "owner",
          href: "/owners",
          label: "Owners",
        },
        {
          active: activeRole === "staff",
          href: "/staff",
          label: "Staff",
        },
        {
          active: activeRole === "tenant",
          href: "/tenants",
          label: "Tenants",
        },
        {
          active: activeRole === "vendor",
          href: "/vendors",
          label: "Vendors",
        },
        {
          active: false,
          href: "/users-roles",
          label: "Workspace Access",
        },
      ]}
      label="People views"
    />
  );
}
