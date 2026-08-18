"use client";

import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";

const financeDestinations = [
  {
    href: "/finance",
    label: "Portfolio review",
    route: "/finance",
  },
  {
    href: "/rent-income",
    label: "Rent & collections",
    route: "/rent-income",
  },
  { href: "/bills-expenses", label: "Expenses", route: "/bills-expenses" },
  { href: "/balances", label: "Owner accounts", route: "/balances" },
  { href: "/finance/advanced", label: "Advanced", route: "/finance/advanced" },
] as const;

const financeManagerDestinations = [
  { href: "/finance", label: "Review queue", route: "/finance" },
  ...financeDestinations.slice(1),
] as const;

const financeMemberDestinations = [
  { href: "/finance", label: "My submissions", route: "/finance" },
  { href: "/bills-expenses", label: "Expenses", route: "/bills-expenses" },
] as const;

export type FinanceWorkspaceRoute =
  | (typeof financeDestinations)[number]["route"]
  | "/ledger"
  | "/petty-cash"
  | "/reports";

export function FinanceWorkspaceNavigation({
  activeRoute,
  canReadFinanceReports = false,
  role = "super_admin",
}: {
  activeRoute: FinanceWorkspaceRoute;
  canReadFinanceReports?: boolean;
  role?: "super_admin" | "finance_manager" | "finance_member";
}) {
  const roleDestinations =
    role === "finance_member"
      ? financeMemberDestinations
      : role === "finance_manager"
        ? financeManagerDestinations
        : financeDestinations;
  const destinations = canReadFinanceReports
    ? [
        ...roleDestinations,
        { href: "/reports", label: "Reports", route: "/reports" } as const,
      ]
    : roleDestinations;

  return (
    <LocalWorkspaceNav
      className="py-1 md:hidden"
      items={destinations.map((destination) => ({
        active: activeRoute === destination.route,
        href: destination.href,
        label: destination.label,
      }))}
      label="Finance workspace"
    />
  );
}
