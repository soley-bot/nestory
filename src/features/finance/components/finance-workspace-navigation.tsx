"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const financeDestinations = [
  {
    href: "/finance",
    label: "Finance work",
    route: "/finance",
  },
  { href: "/rent-income", label: "Rent", route: "/rent-income" },
  { href: "/bills-expenses", label: "Expenses", route: "/bills-expenses" },
  { href: "/balances", label: "Owner balances", route: "/balances" },
  { href: "/leases", label: "Leases", route: "/leases" },
  { href: "/ledger", label: "Ledger", route: "/ledger" },
  { href: "/petty-cash", label: "Petty Cash", route: "/petty-cash" },
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
    ? [...financeDestinations, { href: "/reports", label: "Reports", route: "/reports" } as const]
    : financeDestinations;

  return (
    <nav
      aria-label="Finance workspace"
      className="min-w-0 overflow-x-auto px-4 py-1 sm:px-6 md:hidden"
    >
      <div className="flex min-w-max items-center gap-1">
        {destinations.map((destination) => (
          <Link
            aria-current={
              activeRoute === destination.route ? "page" : undefined
            }
            className={navClass(activeRoute === destination.route)}
            href={destination.href}
            key={destination.route}
            prefetch={false}
          >
            {destination.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function navClass(active: boolean) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
    active && "bg-accent text-foreground",
  );
}
