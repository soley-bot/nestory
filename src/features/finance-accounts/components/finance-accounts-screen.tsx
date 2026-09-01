"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  setFinanceAccountArchivedAction,
  type FinanceAccountActionState,
} from "@/features/finance-accounts/actions";
import { FinanceAccountForm } from "@/features/finance-accounts/components/finance-account-form";
import type {
  FinanceAccountClass,
  FinanceAccountsData,
  FinanceAccountSummary,
} from "@/features/finance-accounts/finance-accounts.types";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";

const accountClassOrder: readonly FinanceAccountClass[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

const accountClassLabels: Record<FinanceAccountClass, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const accountSubtypeLabels: Record<string, string> = {
  accounts_payable: "Accounts payable",
  accounts_receivable: "Accounts receivable",
  bank: "Bank",
  cash: "Cash",
  cogs: "Cost of goods sold",
  credit_card: "Credit card",
  current_liability: "Current liability",
  equity: "Equity",
  expense: "Expense",
  fixed_asset: "Fixed asset",
  income: "Income",
  long_term_liability: "Long-term liability",
  other_asset: "Other asset",
  other_current_asset: "Other current asset",
  other_expense: "Other expense",
  other_income: "Other income",
  petty_cash: "Petty cash",
};

type StatusFilter = "active" | "all" | "inactive";
type DrawerState =
  | { mode: "create" }
  | { account: FinanceAccountSummary; mode: "edit" | "view" }
  | null;

export function FinanceAccountsScreen({
  canManageAccounts,
  groups,
}: FinanceAccountsData & { canManageAccounts: boolean }) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [query, setQuery] = useState("");
  const [accountClass, setAccountClass] = useState<"all" | FinanceAccountClass>("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const accounts = useMemo(() => groups.flatMap((group) => group.accounts), [groups]);
  const parentIds = useMemo(
    () => new Set(accounts.flatMap((account) => account.parentAccountId ? [account.parentAccountId] : [])),
    [accounts],
  );
  const [expandedParents, setExpandedParents] = useState(
    () => new Set(parentIds),
  );
  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return accountClassOrder.map((groupClass) => {
      const group = groups.find((candidate) => candidate.accountClass === groupClass);
      const visibleAccounts = (group?.accounts ?? []).filter((account) => {
        if (accountClass !== "all" && account.accountClass !== accountClass) return false;
        const active = account.archivedAt === null;
        if (status === "active" && !active) return false;
        if (status === "inactive" && active) return false;
        if (normalizedQuery && ![
          account.accountNumber,
          account.displayName,
          account.description,
          accountSubtypeLabel(account.accountSubtype),
          ...defaultLabels(account),
        ].filter(Boolean).some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))) {
          return false;
        }
        return account.depth === 0 || Boolean(normalizedQuery) || expandedParents.has(account.parentAccountId ?? "");
      });
      return { accountClass: groupClass, accounts: visibleAccounts };
    });
  }, [accountClass, expandedParents, groups, query, status]);
  const visibleCount = visibleGroups.reduce((count, group) => count + group.accounts.length, 0);

  return (
    <WorkspacePage
      actions={canManageAccounts ? (
        <Button onClick={() => setDrawer({ mode: "create" })}>
          <Plus aria-hidden="true" />
          New account
        </Button>
      ) : null}
      breadcrumbItems={[{ href: "/finance", label: "Finance" }]}
      localNav={<FinanceWorkspaceNavigation activeRoute="/finance/accounts" />}
      title="Chart of Accounts"
      toolbar={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SearchInput
            aria-label="Search accounts"
            className="w-full sm:w-64"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search accounts"
            role="searchbox"
            value={query}
          />
          <select
            aria-label="Account type filter"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setAccountClass(event.target.value as "all" | FinanceAccountClass)}
            value={accountClass}
          >
            <option value="all">All types</option>
            {accountClassOrder.map((value) => (
              <option key={value} value={value}>{accountClassLabels[value]}</option>
            ))}
          </select>
          <select
            aria-label="Account status"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            value={status}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      }
    >
      <div className="workspace-gutter-x py-4">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {visibleCount === 0 ? (
            <EmptyState
              body="Change the search, type, or status filter."
              kind="filtered"
              title="No accounts match these filters."
            />
          ) : (
            <table className="block w-full border-collapse text-sm md:table">
              <caption className="sr-only">Organization Chart of Accounts</caption>
              <thead className="hidden bg-[var(--table-header-bg)] text-left text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground md:table-header-group">
                <tr>
                  <th className="px-4 py-2.5" scope="col">Account</th>
                  <th className="px-3 py-2.5" scope="col">Type</th>
                  <th className="px-3 py-2.5" scope="col">Default for</th>
                  <th className="px-3 py-2.5" scope="col">Description</th>
                  <th className="px-3 py-2.5" scope="col">Status</th>
                  <th className="px-4 py-2.5 text-right" scope="col">Action</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {visibleGroups.map((group) =>
                  group.accounts.length > 0 || (accountClass === "all" && !query.trim()) ? (
                  <AccountGroupRows
                    accounts={group.accounts}
                    canManageAccounts={canManageAccounts}
                    expandedParents={expandedParents}
                    key={group.accountClass}
                    label={accountClassLabels[group.accountClass]}
                    onOpen={(account) => setDrawer({
                      account,
                      mode: canManageAccounts ? "edit" : "view",
                    })}
                    onToggleParent={(accountId) => setExpandedParents((current) => {
                      const next = new Set(current);
                      if (next.has(accountId)) next.delete(accountId);
                      else next.add(accountId);
                      return next;
                    })}
                    parentIds={parentIds}
                  />
                  ) : null,
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SideDrawer
        onClose={() => setDrawer(null)}
        open={drawer !== null}
        title={drawer?.mode === "create"
          ? "New account"
          : drawer?.mode === "edit"
            ? "Edit account"
            : "Account details"}
      >
        {drawer?.mode === "create" ? (
          <FinanceAccountForm accounts={accounts} mode="create" onCancel={() => setDrawer(null)} />
        ) : drawer?.mode === "edit" ? (
          <FinanceAccountForm
            account={drawer.account}
            accounts={accounts}
            mode="edit"
            onCancel={() => setDrawer(null)}
          />
        ) : drawer?.mode === "view" ? (
          <AccountDetails account={drawer.account} />
        ) : null}
      </SideDrawer>
    </WorkspacePage>
  );
}

function AccountGroupRows({
  accounts,
  canManageAccounts,
  expandedParents,
  label,
  onOpen,
  onToggleParent,
  parentIds,
}: {
  accounts: FinanceAccountSummary[];
  canManageAccounts: boolean;
  expandedParents: ReadonlySet<string>;
  label: string;
  onOpen: (account: FinanceAccountSummary) => void;
  onToggleParent: (accountId: string) => void;
  parentIds: ReadonlySet<string>;
}) {
  return (
    <>
      <tr className="block border-y border-border bg-muted/55 first:border-t-0 md:table-row">
        <th className="block px-4 py-2 text-left md:table-cell" colSpan={6} scope="rowgroup">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">{label}</h2>
        </th>
      </tr>
      {accounts.map((account) => (
        <tr className="block border-b border-border p-3 last:border-b-0 md:table-row md:p-0" key={account.id}>
          <td className="block min-w-0 py-1 md:table-cell md:px-4 md:py-3">
            <span className="mb-1 block text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground md:hidden">Account</span>
            <div className={account.depth === 1 ? "pl-6" : undefined}>
              <div className="flex min-w-0 items-start gap-1.5">
                {parentIds.has(account.id) ? (
                  <Button
                    aria-expanded={expandedParents.has(account.id)}
                    aria-label={`${expandedParents.has(account.id) ? "Collapse" : "Expand"} ${account.displayName}`}
                    className="mt-[-0.2rem]"
                    onClick={() => onToggleParent(account.id)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    {expandedParents.has(account.id) ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                ) : account.depth === 1 ? (
                  <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-border" />
                ) : null}
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{account.displayName}</span>
                  {account.accountNumber ? (
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{account.accountNumber}</span>
                  ) : null}
                </span>
              </div>
            </div>
          </td>
          <StackedCell label="Type">
            <span className="font-medium">{accountSubtypeLabel(account.accountSubtype)}</span>
            {account.propertyLabel ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{account.propertyLabel}</span>
            ) : null}
          </StackedCell>
          <StackedCell label="Default for">
            {defaultLabels(account).length > 0 ? defaultLabels(account).join(", ") : "—"}
          </StackedCell>
          <StackedCell label="Description">
            <span className="text-muted-foreground">{account.description ?? "—"}</span>
          </StackedCell>
          <StackedCell label="Status">
            <Badge tone={account.archivedAt ? "warning" : "success"}>
              {account.archivedAt ? "Inactive" : "Active"}
            </Badge>
          </StackedCell>
          <td className="block py-1 md:table-cell md:px-4 md:py-3 md:text-right">
            <span className="mb-1 block text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground md:hidden">Action</span>
            <div className="flex flex-wrap items-center gap-1 md:justify-end">
              <Button
                aria-label={`${canManageAccounts ? "Edit" : "View"} ${account.displayName}`}
                onClick={() => onOpen(account)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {canManageAccounts ? "Edit" : "View"}
              </Button>
              {canManageAccounts && (account.archivedAt || (!account.systemRole && account.defaultFor.length === 0)) ? (
                <AccountLifecycleButton account={account} />
              ) : null}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function StackedCell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <td className="block py-1 md:table-cell md:px-3 md:py-3 md:align-top">
      <span className="mb-1 block text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground md:hidden">{label}</span>
      {children}
    </td>
  );
}

function AccountLifecycleButton({ account }: { account: FinanceAccountSummary }) {
  const [state, formAction, pending] = useActionState<FinanceAccountActionState, FormData>(
    setFinanceAccountArchivedAction,
    {},
  );
  const makeActive = Boolean(account.archivedAt);
  const label = `${makeActive ? "Make active" : "Make inactive"} ${account.displayName}`;
  const feedback = state.message ?? state.fieldErrors?.replacementAccountId?.[0];

  return (
    <form action={formAction}>
      <input name="accountId" type="hidden" value={account.id} />
      <input name="archived" type="hidden" value={makeActive ? "false" : "true"} />
      <input name="replacementAccountId" type="hidden" value="" />
      <Button aria-label={label} disabled={pending} size="sm" type="submit" variant="ghost">
        {pending ? "Saving" : makeActive ? "Make active" : "Make inactive"}
      </Button>
      <span aria-live="polite" className="sr-only">{feedback}</span>
    </form>
  );
}

function AccountDetails({ account }: { account: FinanceAccountSummary }) {
  const rows = [
    ["Account", account.displayName],
    ["Type", accountSubtypeLabel(account.accountSubtype)],
    ["Default for", defaultLabels(account).join(", ") || "None"],
    ["Description", account.description ?? "None"],
    ["Status", account.archivedAt ? "Inactive" : "Active"],
    ["Available to", account.propertyLabel ?? "All properties"],
  ];
  return (
    <dl className="divide-y divide-border px-5 py-2 text-sm">
      {rows.map(([term, value]) => (
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]" key={term}>
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function accountSubtypeLabel(subtype: string) {
  return accountSubtypeLabels[subtype] ?? subtype.replaceAll("_", " ");
}

function defaultLabels(account: FinanceAccountSummary) {
  const labels = [...account.defaultFor];
  if (account.useForLeaseCharges) labels.push("Lease charges");
  if (account.useForLeaseCredits) labels.push("Lease credits");
  if (account.useForLeaseDeposits) labels.push("Lease deposits");
  return [...new Set(labels)];
}
