"use client";

import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";

const financeDestinations = [
  {
    href: "/finance",
    label: "Work queue",
    route: "/finance",
  },
  {
    href: "/rent-income",
    label: "Rent & collections",
    route: "/rent-income",
  },
  { href: "/bills-expenses", label: "Expenses", route: "/bills-expenses" },
  { href: "/balances", label: "Owner accounts", route: "/balances" },
  { href: "/petty-cash", label: "Petty cash", route: "/petty-cash" },
  { href: "/ledger", label: "Ledger", route: "/ledger" },
] as const;

export type FinanceWorkspaceRoute =
  | (typeof financeDestinations)[number]["route"]
  | "/reports";

export function FinanceWorkspaceNavigation({
  activeRoute,
  canReadFinanceReports = false,
}: {
  activeRoute: FinanceWorkspaceRoute;
  canReadFinanceReports?: boolean;
}) {
  const destinations = canReadFinanceReports
    ? [
        ...financeDestinations,
        { href: "/reports", label: "Reports", route: "/reports" } as const,
      ]
    : financeDestinations;

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
