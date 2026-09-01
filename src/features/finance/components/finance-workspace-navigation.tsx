"use client";

import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";

const financeDestinations = {
  advanced: {
    href: "/finance/advanced",
    label: "Advanced",
    route: "/finance/advanced",
  },
  balances: {
    href: "/balances",
    label: "Owner accounts",
    route: "/balances",
  },
  expenses: {
    href: "/bills-expenses",
    label: "Expenses",
    route: "/bills-expenses",
  },
  finance: {
    href: "/finance",
    label: "Portfolio review",
    route: "/finance",
  },
  fundingSources: {
    href: "/finance/funding-sources",
    label: "Funding sources",
    route: "/finance/funding-sources",
  },
  rent: {
    href: "/rent-income",
    label: "Rent & collections",
    route: "/rent-income",
  },
} as const;

export type FinanceWorkspaceRoute =
  | (typeof financeDestinations)[keyof typeof financeDestinations]["route"]
  | "/ledger"
  | "/petty-cash"
  | "/reports";

export function FinanceWorkspaceNavigation({
  activeRoute,
  canClosePeriods = false,
  canCorrectFinance = false,
  canReadFinanceReports = false,
  canRecordPayments = false,
  canReviewExpense = false,
  canSubmitExpense = false,
}: {
  activeRoute: FinanceWorkspaceRoute;
  canClosePeriods?: boolean;
  canCorrectFinance?: boolean;
  canReadFinanceReports?: boolean;
  canRecordPayments?: boolean;
  canReviewExpense?: boolean;
  canSubmitExpense?: boolean;
}) {
  const destinations: Array<
    (typeof financeDestinations)[keyof typeof financeDestinations]
  > = [financeDestinations.finance];
  if (canRecordPayments) destinations.push(financeDestinations.rent);
  if (canSubmitExpense || canReviewExpense || canCorrectFinance) {
    destinations.push(financeDestinations.expenses);
  }
  destinations.push(financeDestinations.balances);
  destinations.push(financeDestinations.fundingSources);
  if (canCorrectFinance || canClosePeriods) {
    destinations.push(financeDestinations.advanced);
  }

  const visibleDestinations = canReadFinanceReports
    ? [
        ...destinations,
        { href: "/reports", label: "Reports", route: "/reports" } as const,
      ]
    : destinations;

  return (
    <LocalWorkspaceNav
      className="py-1 md:hidden"
      items={visibleDestinations.map((destination) => ({
        active: activeRoute === destination.route,
        href: destination.href,
        label: destination.label,
      }))}
      label="Finance workspace"
    />
  );
}
