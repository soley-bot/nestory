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
  { href: "/balances", label: "Owner Balance", route: "/balances" },
  { href: "/leases", label: "Leases", route: "/leases" },
  { href: "/ledger", label: "Ledger", route: "/ledger" },
  { href: "/petty-cash", label: "Petty Cash", route: "/petty-cash" },
] as const;

export type FinanceWorkspaceRoute =
  | (typeof financeDestinations)[number]["route"]
  | "/reports";

export function FinanceWorkspaceNavigation({
  activeRoute,
}: {
  activeRoute: FinanceWorkspaceRoute;
}) {
  return (
    <nav
      aria-label="Finance workspace"
      className="min-w-0 overflow-x-auto px-4 py-1 sm:px-6"
    >
      <div className="flex min-w-max items-center gap-1">
        {financeDestinations.map((destination) => (
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
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-foreground-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
    active && "bg-accent-soft text-foreground",
  );
}
