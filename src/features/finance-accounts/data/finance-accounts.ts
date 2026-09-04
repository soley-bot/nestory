import "server-only";

import { createSupabaseServerClient } from "@/lib/db/server";
import type { Database } from "@/types/database";
import type {
  FinanceAccountClass,
  FinanceAccountOption,
  FinanceAccountsData,
  FinanceAccountSummary,
} from "@/features/finance-accounts/finance-accounts.types";

type FinanceAccountRow = Pick<
  Database["public"]["Tables"]["finance_accounts"]["Row"],
  | "account_class" | "account_number" | "account_subtype" | "archived_at"
  | "description" | "display_name" | "id" | "parent_account_id" | "property_id"
  | "system_role" | "use_for_lease_charges" | "use_for_lease_credits"
  | "use_for_lease_deposits"
>;
type FinanceAccountRoleRow = Pick<
  Database["public"]["Tables"]["finance_account_roles"]["Row"],
  "account_id" | "role_code"
>;
type PropertyRow = Pick<
  Database["public"]["Tables"]["properties"]["Row"],
  "archived_at" | "code" | "id" | "name"
>;

const ACCOUNT_CLASS_ORDER: readonly FinanceAccountClass[] = [
  "asset", "liability", "equity", "income", "expense",
];
const ROLE_LABEL_BY_CODE: Readonly<Record<string, string>> = {
  accounts_payable: "Accounts payable",
  accounts_receivable: "Accounts receivable",
  opening_balance: "Opening balance",
  operating_bank: "Operating account",
  owner_contributions: "Owner contributions",
  owner_distributions: "Owner distributions",
  rental_income: "Rent income",
  retained_earnings: "Retained earnings",
  security_deposits: "Security deposits",
  trust_bank: "Trust account",
  undeposited_funds: "Undeposited funds",
};
const ACCOUNT_NAME_COMPARATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export async function getFinanceAccountsData(
  organizationId: string,
): Promise<FinanceAccountsData> {
  const supabase = await createSupabaseServerClient();
  const [accountsResult, rolesResult, sourceLinksResult, categoryLinksResult, propertiesResult] = await Promise.all([
    supabase.from("finance_accounts").select(
      "id, account_class, account_number, account_subtype, archived_at, description, display_name, parent_account_id, property_id, system_role, use_for_lease_charges, use_for_lease_credits, use_for_lease_deposits",
    ).eq("organization_id", organizationId).order("account_class").order("account_number").order("display_name"),
    supabase.from("finance_account_roles").select("account_id, role_code").eq("organization_id", organizationId).order("role_code"),
    supabase.from("finance_account_source_links").select("account_id").eq("organization_id", organizationId).order("account_id"),
    supabase.from("finance_account_category_links").select("account_id").eq("organization_id", organizationId).order("account_id"),
    supabase.from("properties").select("id, code, name, archived_at").eq("organization_id", organizationId).order("code").order("name"),
  ]);

  assertReadSucceeded("accounts", accountsResult.error);
  assertReadSucceeded("account defaults", rolesResult.error);
  assertReadSucceeded("account source mappings", sourceLinksResult.error);
  assertReadSucceeded("account category mappings", categoryLinksResult.error);
  assertReadSucceeded("account properties", propertiesResult.error);

  const propertyRows = (propertiesResult.data ?? []) as PropertyRow[];
  const propertyLabelById = new Map(
    propertyRows.map((property) => [property.id, `${property.code} · ${property.name}`]),
  );
  const properties = propertyRows.filter((property) => property.archived_at === null).map((property) => ({
    id: property.id,
    label: `${property.code} · ${property.name}`,
  }));
  const defaultForByAccountId = groupDefaultRolesByAccount((rolesResult.data ?? []) as FinanceAccountRoleRow[]);
  const summariesById = new Map(
    ((accountsResult.data ?? []) as FinanceAccountRow[]).map((account) => [
      account.id,
      toFinanceAccountSummary(account, defaultForByAccountId.get(account.id) ?? [], propertyLabelById),
    ]),
  );
  return {
    groups: ACCOUNT_CLASS_ORDER.map((accountClass) => ({
      accountClass,
      accounts: flattenAccountGroup(accountClass, summariesById),
    })),
    properties,
  };
}

export function getPayFromAccountOptions(accounts: readonly FinanceAccountSummary[]): FinanceAccountOption[] {
  return accounts.filter((account) => account.archivedAt === null && (
    (account.accountClass === "asset" && ["bank", "cash", "petty_cash"].includes(account.accountSubtype)) ||
    (account.accountClass === "liability" && account.accountSubtype === "credit_card")
  )).map(toFinanceAccountOption);
}

export function getExpenseAccountOptions(accounts: readonly FinanceAccountSummary[]): FinanceAccountOption[] {
  return accounts.filter((account) => account.archivedAt === null && account.accountClass === "expense").map(toFinanceAccountOption);
}

export function getLeaseChargeAccountOptions(accounts: readonly FinanceAccountSummary[]): FinanceAccountOption[] {
  return accounts.filter((account) => account.archivedAt === null && account.accountClass === "income" && account.useForLeaseCharges).map(toFinanceAccountOption);
}

export function getLeaseDepositAccountOptions(accounts: readonly FinanceAccountSummary[]): FinanceAccountOption[] {
  return accounts.filter((account) => account.archivedAt === null && account.accountClass === "liability" && account.useForLeaseDeposits).map(toFinanceAccountOption);
}

function toFinanceAccountSummary(account: FinanceAccountRow, defaultFor: string[], propertyLabelById: ReadonlyMap<string, string>): FinanceAccountSummary {
  return {
    accountClass: toFinanceAccountClass(account.account_class),
    accountNumber: account.account_number,
    accountSubtype: account.account_subtype,
    archivedAt: account.archived_at,
    defaultFor,
    depth: 0,
    description: account.description,
    displayName: account.display_name,
    id: account.id,
    parentAccountId: account.parent_account_id,
    propertyId: account.property_id,
    propertyLabel: account.property_id ? propertyLabelById.get(account.property_id) ?? "Property unavailable" : null,
    systemRole: account.system_role ? roleLabel(account.system_role) : null,
    useForLeaseCharges: account.use_for_lease_charges,
    useForLeaseCredits: account.use_for_lease_credits,
    useForLeaseDeposits: account.use_for_lease_deposits,
  };
}

function groupDefaultRolesByAccount(roles: readonly FinanceAccountRoleRow[]): ReadonlyMap<string, string[]> {
  const labelsByAccountId = new Map<string, string[]>();
  for (const role of roles) {
    const labels = labelsByAccountId.get(role.account_id) ?? [];
    labels.push(roleLabel(role.role_code));
    labelsByAccountId.set(role.account_id, labels);
  }
  return labelsByAccountId;
}

function flattenAccountGroup(accountClass: FinanceAccountClass, summariesById: ReadonlyMap<string, FinanceAccountSummary>): FinanceAccountSummary[] {
  const accounts = [...summariesById.values()].filter((account) => account.accountClass === accountClass);
  const childAccountsByParentId = new Map<string, FinanceAccountSummary[]>();
  const rootAccounts: FinanceAccountSummary[] = [];
  for (const account of accounts) {
    if (!account.parentAccountId) {
      rootAccounts.push(account);
      continue;
    }
    const parent = summariesById.get(account.parentAccountId);
    if (!parent || parent.accountClass !== account.accountClass || parent.parentAccountId !== null) {
      throw new Error("Could not load Chart of Accounts.");
    }
    const children = childAccountsByParentId.get(parent.id) ?? [];
    children.push(account);
    childAccountsByParentId.set(parent.id, children);
  }
  return rootAccounts.toSorted(compareAccounts).flatMap((account) => [
    account,
    ...(childAccountsByParentId.get(account.id) ?? []).toSorted(compareAccounts).map((child) => ({ ...child, depth: 1 as const })),
  ]);
}

function compareAccounts(first: FinanceAccountSummary, second: FinanceAccountSummary) {
  if (first.accountNumber && second.accountNumber) {
    const numberComparison = ACCOUNT_NAME_COMPARATOR.compare(first.accountNumber, second.accountNumber);
    if (numberComparison !== 0) return numberComparison;
  } else if (first.accountNumber) return -1;
  else if (second.accountNumber) return 1;
  const nameComparison = ACCOUNT_NAME_COMPARATOR.compare(first.displayName, second.displayName);
  return nameComparison !== 0 ? nameComparison : ACCOUNT_NAME_COMPARATOR.compare(first.id, second.id);
}

function toFinanceAccountOption(account: FinanceAccountSummary): FinanceAccountOption {
  return { accountClass: account.accountClass, accountSubtype: account.accountSubtype, displayName: account.displayName, id: account.id, propertyId: account.propertyId, useForLeaseCredits: account.useForLeaseCredits };
}

function toFinanceAccountClass(value: string): FinanceAccountClass {
  if ((ACCOUNT_CLASS_ORDER as readonly string[]).includes(value)) return value as FinanceAccountClass;
  throw new Error("Could not load Chart of Accounts.");
}

function roleLabel(roleCode: string): string {
  const label = ROLE_LABEL_BY_CODE[roleCode];
  if (label) return label;
  throw new Error("Could not load Chart of Accounts.");
}

function assertReadSucceeded(subject: string, error: { message: string } | null) {
  if (error) throw new Error(`Could not load ${subject}: ${error.message}`);
}
