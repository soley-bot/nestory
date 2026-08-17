import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import { requireFinanceContext } from "@/lib/auth/context";

const advancedTools = [
  {
    description: "Inspect the full accounting record when reconciliation requires it.",
    href: "/ledger",
    label: "Ledger",
  },
  {
    description: "Continue existing cash-float workflows without placing them in daily Finance.",
    href: "/petty-cash",
    label: "Petty cash",
  },
  {
    description: "Read historical global policy versions retained for audit evidence.",
    href: "/settings/rent-policy",
    label: "Historical rent policies",
  },
];

export default async function AdvancedFinancePage() {
  const context = await requireFinanceContext();
  return (
    <WorkspacePage
      context="Specialized and historical tools"
      contextHref="/finance/advanced"
      localNav={
        <FinanceWorkspaceNavigation
          activeRoute="/finance/advanced"
          canReadFinanceReports={context.capabilities.canReadFinanceReports}
          role={context.role}
        />
      }
      title="Advanced finance"
    >
      <div className="workspace-gutter-x grid gap-3 py-4 sm:grid-cols-2 xl:grid-cols-3">
        {advancedTools.map((tool) => (
          <Link
            className="group rounded-lg border border-border p-4 transition-colors hover:bg-muted/40"
            href={tool.href}
            key={tool.href}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{tool.label}</h2>
              <ArrowRight className="text-muted-foreground group-hover:text-foreground" size={16} />
            </div>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              {tool.description}
            </p>
          </Link>
        ))}
      </div>
    </WorkspacePage>
  );
}
