"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FinanceCategory } from "@/features/finance-operations/finance-operations.types";

export function FinanceCategorySetupEntry() {
  return (
    <section aria-label="Finance setup">
      <Button asChild size="sm" variant="ghost">
        <Link aria-label="Open Chart of Accounts" href="/finance/accounts">
          <Settings2 aria-hidden="true" />
          Chart of accounts
        </Link>
      </Button>
    </section>
  );
}

/** Legacy categories are retained only to explain historical records. */
export function FinanceCategoryManager({
  categories,
}: {
  canManage: boolean;
  categories: FinanceCategory[];
}) {
  return (
    <div className="space-y-5 p-4">
      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        These legacy labels are read-only. Configure current workflow choices in the Chart of Accounts.
      </p>
      {(["owner_expense", "tenant_billing"] as const).map((namespace) => (
        <section className="space-y-2" key={namespace}>
          <h2 className="text-sm font-semibold">
            {namespace === "owner_expense" ? "Owner expenses" : "Tenant billing"}
          </h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {categories
              .filter((category) => category.namespace === namespace)
              .map((category) => (
                <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm" key={category.id}>
                  <span>{category.displayLabel}</span>
                  {!category.isActive ? (
                    <span className="text-xs text-muted-foreground">Archived</span>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
