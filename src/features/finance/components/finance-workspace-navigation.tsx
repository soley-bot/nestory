"use client";

import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const financeDestinations = [
  {
    href: "/finance-dashboard",
    label: "Finance work",
    route: "/finance-dashboard",
  },
  { href: "/rent-income", label: "Rent", route: "/rent-income" },
  { href: "/bills-expenses", label: "Expenses", route: "/bills-expenses" },
  { href: "/balances", label: "Balances", route: "/balances" },
  { href: "/leases", label: "Leases", route: "/leases" },
] as const;

const moreDestinations = [
  { href: "/ledger", label: "Ledger", route: "/ledger" },
  { href: "/petty-cash", label: "Petty Cash", route: "/petty-cash" },
] as const;

export type FinanceWorkspaceRoute =
  | (typeof financeDestinations)[number]["route"]
  | (typeof moreDestinations)[number]["route"];

export function FinanceWorkspaceNavigation({
  activeRoute,
}: {
  activeRoute: FinanceWorkspaceRoute;
}) {
  const moreActive = moreDestinations.some(
    (destination) => destination.route === activeRoute,
  );
  return (
    <nav
      aria-label="Finance workspace"
      className="min-w-0 overflow-x-auto px-4 py-1.5 sm:px-6"
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
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              aria-current={moreActive ? "page" : undefined}
              className={navClass(moreActive)}
              type="button"
            >
              More <ChevronDown size={13} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              className="z-50 mt-1 w-40 rounded-md border border-border bg-surface p-1 shadow-lg"
              sideOffset={2}
            >
              {moreDestinations.map((destination) => (
                <Link
                  className="block rounded px-2.5 py-2 text-sm hover:bg-surface-muted"
                  href={destination.href}
                  key={destination.route}
                >
                  {destination.label}
                </Link>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
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
