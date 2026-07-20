import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";

const financeDestinations = [
  { href: "/rent-income", label: "Rent & Income", route: "/rent-income" },
  { href: "/bills-expenses", label: "Bills & Expenses", route: "/bills-expenses" },
  { href: "/leases", label: "Leases", route: "/leases" },
  { href: "/ledger", label: "Financial Ledger", route: "/ledger" },
  { href: "/petty-cash", label: "Petty Cash", route: "/petty-cash" },
] as const;

export function FinanceWorkspaceNavigation({
  activeRoute,
}: {
  activeRoute: (typeof financeDestinations)[number]["route"];
}) {
  return (
    <LocalWorkspaceNav
      items={financeDestinations.map((destination) => ({
        active: activeRoute === destination.route,
        href: destination.href,
        label: destination.label,
      }))}
      label="Finance workspace"
    />
  );
}
