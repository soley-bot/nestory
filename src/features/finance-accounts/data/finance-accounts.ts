import "server-only";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/db/server";
import { readAllRows, readAllRowsByIds } from "@/lib/db/read-all-rows";
import type { FinanceAccountQuery } from "../finance-account-query";
import type { Database } from "@/types/database";
import type {
  FinanceAccountClass,
  FinanceAccountOption,
  FinanceAccountsData,
  FinanceAccountSummary,
  FinanceAccountRegisterData,
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

const accountPageSchema = z.object({
  accounts: z.array(z.object({
    id: z.string(), account_class: z.enum(["asset","liability","equity","income","expense"]),
    account_number: z.string().nullable(), account_subtype: z.string(), archived_at: z.string().nullable(),
    description: z.string().nullable(), display_name: z.string(), parent_account_id: z.string().nullable(),
    property_id: z.string().nullable(), system_role: z.string().nullable(), use_for_lease_charges: z.boolean(),
    use_for_lease_credits: z.boolean(), use_for_lease_deposits: z.boolean(),
  })),
  pagination: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(), totalCount: z.number().int().nonnegative(), totalPages: z.number().int().positive() }),
});

export async function getFinanceAccountRegisterData(organizationId: string, query: FinanceAccountQuery): Promise<FinanceAccountRegisterData> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_finance_account_register_page", {
    p_organization_id: organizationId, p_query: query.query, p_account_class: query.accountClass,
    p_status: query.status, p_page: query.page, p_page_size: query.pageSize,
  });
  assertReadSucceeded("accounts", result.error);
  const parsed = accountPageSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Could not load account page: malformed response.");
  const { accounts, pagination } = parsed.data;
  const expectedPages = Math.max(1,Math.ceil(pagination.totalCount/query.pageSize));
  const expectedPage = Math.min(query.page,expectedPages);
  const expectedFrom = pagination.totalCount ? (expectedPage-1)*query.pageSize+1 : 0;
  const expectedTo = Math.min(expectedPage*query.pageSize,pagination.totalCount);
  const expectedCount = pagination.totalCount ? expectedTo-expectedFrom+1 : 0;
  if (pagination.pageSize !== query.pageSize || pagination.totalPages !== expectedPages || pagination.page !== expectedPage
    || pagination.from !== expectedFrom || pagination.to !== expectedTo || accounts.length !== expectedCount
    || new Set(accounts.map(account => account.id)).size !== accounts.length) throw new Error("Could not load account page: malformed rows.");
  const ids = accounts.map(account => account.id);
  const propertyIds = accounts.flatMap(account => account.property_id ? [account.property_id] : []);
  const [roles, sources, categories, properties] = await Promise.all([
    readAllRowsByIds(ids, (batch, from, to) => supabase.from("finance_account_roles").select("account_id, role_code").eq("organization_id", organizationId).in("account_id", batch).order("role_code").range(from, to)),
    readAllRowsByIds(ids, (batch, from, to) => supabase.from("finance_account_source_links").select("account_id").eq("organization_id", organizationId).in("account_id", batch).order("account_id").order("source_id").range(from, to)),
    readAllRowsByIds(ids, (batch, from, to) => supabase.from("finance_account_category_links").select("account_id").eq("organization_id", organizationId).in("account_id", batch).order("account_id").order("category_id").range(from, to)),
    readAllRowsByIds(propertyIds, (batch, from, to) => supabase.from("properties").select("id, code, name, archived_at").eq("organization_id", organizationId).in("id", batch).order("id").range(from, to)),
  ]);
  assertReadSucceeded("account defaults", roles.error);
  assertReadSucceeded("account source mappings", sources.error);
  assertReadSucceeded("account category mappings", categories.error);
  assertReadSucceeded("account properties", properties.error);
  const rolesById = groupDefaultRolesByAccount(roles.data ?? []);
  const propertyLabels = new Map((properties.data ?? []).map(property => [property.id, `${property.code} · ${property.name}`]));
  const summaries = accounts.map(account => ({ ...toFinanceAccountSummary(account, rolesById.get(account.id) ?? [], propertyLabels), depth: account.parent_account_id ? 1 as const : 0 as const }));
  return { groups: ACCOUNT_CLASS_ORDER.map(accountClass => ({ accountClass, accounts: summaries.filter(account => account.accountClass === accountClass) })), properties: [], pagination };
}

export async function getFinanceAccountsData(
  organizationId: string,
): Promise<FinanceAccountsData> {
  const supabase = await createSupabaseServerClient();
  const [accountsResult, rolesResult, sourceLinksResult, categoryLinksResult, propertiesResult] = await Promise.all([
    readAllRows((from, to) => supabase.from("finance_accounts").select(
      "id, account_class, account_number, account_subtype, archived_at, description, display_name, parent_account_id, property_id, system_role, use_for_lease_charges, use_for_lease_credits, use_for_lease_deposits",
    ).eq("organization_id", organizationId).order("account_class").order("account_number").order("display_name").order("id").range(from, to)),
    readAllRows((from, to) => supabase.from("finance_account_roles").select("account_id, role_code").eq("organization_id", organizationId).order("role_code").range(from, to)),
    readAllRows((from, to) => supabase.from("finance_account_source_links").select("account_id").eq("organization_id", organizationId).order("account_id").order("source_id").range(from, to)),
    readAllRows((from, to) => supabase.from("finance_account_category_links").select("account_id").eq("organization_id", organizationId).order("account_id").order("category_id").range(from, to)),
    readAllRows((from, to) => supabase.from("properties").select("id, code, name, archived_at").eq("organization_id", organizationId).order("code").order("name").order("id").range(from, to)),
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
  const defaultRolesByAccountId = groupDefaultRolesByAccount((rolesResult.data ?? []) as FinanceAccountRoleRow[]);
  const summariesById = new Map(
    ((accountsResult.data ?? []) as FinanceAccountRow[]).map((account) => [
      account.id,
      toFinanceAccountSummary(account, defaultRolesByAccountId.get(account.id) ?? [], propertyLabelById),
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

function toFinanceAccountSummary(account: FinanceAccountRow, defaultRoleCodes: string[], propertyLabelById: ReadonlyMap<string, string>): FinanceAccountSummary {
  return {
    accountClass: toFinanceAccountClass(account.account_class),
    accountNumber: account.account_number,
    accountSubtype: account.account_subtype,
    archivedAt: account.archived_at,
    defaultFor: defaultRoleCodes.map(roleLabel),
    defaultRoleCodes,
    depth: 0,
    description: account.description,
    displayName: account.display_name,
    id: account.id,
    parentAccountId: account.parent_account_id,
    propertyId: account.property_id,
    propertyLabel: account.property_id ? propertyLabelById.get(account.property_id) ?? "Property unavailable" : null,
    systemRole: account.system_role ? roleLabel(account.system_role) : null,
    systemRoleCode: account.system_role,
    useForLeaseCharges: account.use_for_lease_charges,
    useForLeaseCredits: account.use_for_lease_credits,
    useForLeaseDeposits: account.use_for_lease_deposits,
  };
}

function groupDefaultRolesByAccount(roles: readonly FinanceAccountRoleRow[]): ReadonlyMap<string, string[]> {
  const rolesByAccountId = new Map<string, string[]>();
  for (const role of roles) {
    const roleCodes = rolesByAccountId.get(role.account_id) ?? [];
    roleLabel(role.role_code);
    roleCodes.push(role.role_code);
    rolesByAccountId.set(role.account_id, roleCodes);
  }
  return rolesByAccountId;
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
  return { accountClass: account.accountClass, accountSubtype: account.accountSubtype, defaultRoleCodes: account.defaultRoleCodes, displayName: account.displayName, id: account.id, propertyId: account.propertyId, systemRoleCode: account.systemRoleCode, useForLeaseCredits: account.useForLeaseCredits };
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
