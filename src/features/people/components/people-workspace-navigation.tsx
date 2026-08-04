"use client";

import { useSearchParams } from "next/navigation";
import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import type { PersonRoleValue } from "@/features/people/people.types";

export function PeopleWorkspaceNavigation({
  activeRole,
}: {
  activeRole?: PersonRoleValue;
}) {
  const roleFromUrl = useSearchParams().get("role");
  const selectedRole = activeRole ?? getRoleFromUrl(roleFromUrl);

  return (
    <LocalWorkspaceNav
      items={[
        { active: !selectedRole, href: "/people", label: "All" },
        {
          active: selectedRole === "owner",
          href: "/owners",
          label: "Owners",
        },
        {
          active: selectedRole === "staff",
          href: "/staff",
          label: "Staff",
        },
        {
          active: selectedRole === "tenant",
          href: "/tenants",
          label: "Tenants",
        },
        {
          active: selectedRole === "vendor",
          href: "/vendors",
          label: "Vendors",
        },
      ]}
      label="People views"
    />
  );
}

function getRoleFromUrl(value: string | null): PersonRoleValue | undefined {
  return value === "owner" ||
    value === "staff" ||
    value === "tenant" ||
    value === "vendor"
    ? value
    : undefined;
}
