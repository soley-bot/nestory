import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));

import {
  getExpenseAccountOptions,
  getFinanceAccountsData,
  getLeaseChargeAccountOptions,
  getLeaseDepositAccountOptions,
  getPayFromAccountOptions,
} from "@/features/finance-accounts/data/finance-accounts";
import type { FinanceAccountSummary } from "@/features/finance-accounts/finance-accounts.types";

describe("getFinanceAccountsData", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("groups accounts in property-accounting order and nests children", async () => {
    // Break caught: returning the database's incidental order or flattening
    // sub-accounts removes the hierarchy operators use to scan the chart.
    const accountQuery = chainQuery({
      data: [
        accountRow({
          account_class: "expense",
          account_number: "6200",
          account_subtype: "expense",
          display_name: "Repairs and maintenance",
          id: "expense-parent",
        }),
        accountRow({
          account_class: "expense",
          account_number: "6210",
          account_subtype: "expense",
          display_name: "Plumbing",
          id: "expense-child",
          parent_account_id: "expense-parent",
        }),
        accountRow({
          account_class: "income",
          account_number: "4000",
          account_subtype: "income",
          display_name: "Rental income",
          id: "income-1",
          system_role: "rental_income",
          use_for_lease_charges: true,
        }),
        accountRow({
          account_class: "asset",
          account_number: "1000",
          account_subtype: "bank",
          display_name: "Operating account",
          id: "asset-1",
          property_id: "property-1",
        }),
        accountRow({
          account_class: "liability",
          account_number: "2000",
          account_subtype: "current_liability",
          display_name: "Security deposits",
          id: "liability-1",
          use_for_lease_deposits: true,
        }),
        accountRow({
          account_class: "equity",
          account_number: "3000",
          account_subtype: "equity",
          display_name: "Opening balance",
          id: "equity-1",
        }),
      ],
      error: null,
    });
    const rolesQuery = chainQuery({
      data: [{ account_id: "income-1", role_code: "rental_income" }],
      error: null,
    });
    const sourceLinksQuery = chainQuery({ data: [], error: null });
    const categoryLinksQuery = chainQuery({ data: [], error: null });
    const propertiesQuery = chainQuery({
      data: [
        { archived_at: null, code: "HIL", id: "property-2", name: "Hill House" },
        { archived_at: null, code: "RIV", id: "property-1", name: "Riverside House" },
      ],
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        switch (table) {
          case "finance_accounts":
            return accountQuery;
          case "finance_account_roles":
            return rolesQuery;
          case "finance_account_source_links":
            return sourceLinksQuery;
          case "finance_account_category_links":
            return categoryLinksQuery;
          case "properties":
            return propertiesQuery;
          default:
            throw new Error(`Unexpected relation: ${table}`);
        }
      }),
    });

    const data = await getFinanceAccountsData("org-1");

    expect(data.groups.map((group) => group.accountClass)).toEqual([
      "asset",
      "liability",
      "equity",
      "income",
      "expense",
    ]);
    expect(
      data.groups.find((group) => group.accountClass === "expense")?.accounts,
    ).toContainEqual(expect.objectContaining({ displayName: "Plumbing", depth: 1 }));
    expect(data.groups.find((group) => group.accountClass === "income")?.accounts).toContainEqual(
      expect.objectContaining({
        defaultFor: ["Rent income"],
        systemRole: "Rent income",
      }),
    );
    expect(data.groups.find((group) => group.accountClass === "asset")?.accounts).toContainEqual(
      expect.objectContaining({ propertyLabel: "RIV · Riverside House" }),
    );
    expect(data.properties).toEqual([
      { id: "property-2", label: "HIL · Hill House" },
      { id: "property-1", label: "RIV · Riverside House" },
    ]);
    expect(sourceLinksQuery.select).toHaveBeenCalled();
    expect(categoryLinksQuery.select).toHaveBeenCalled();
  });

  it("fails closed when an account mapping cannot be read", async () => {
    // Break caught: rendering an incomplete chart when an authoritative mapping
    // is unavailable can send an operator to an incompatible daily workflow.
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) =>
        chainQuery({
          data: null,
          error:
            table === "finance_account_category_links"
              ? { message: "permission denied" }
              : null,
        }),
      ),
    });

    await expect(getFinanceAccountsData("org-1")).rejects.toThrow(
      "Could not load account category mappings: permission denied",
    );
  });

  it("keeps archived property labels for history but excludes them from creation options", async () => {
    // Break caught: filtering archived properties at query time loses the label
    // on an existing historical account, while returning every readable row as
    // a form option lets operators create new accounts for archived properties.
    const accountQuery = chainQuery({
      data: [accountRow({ id: "historical-account", property_id: "archived-property" })],
      error: null,
    });
    const propertiesQuery = chainQuery({
      data: [
        { archived_at: "2026-08-01T00:00:00.000Z", code: "OLD", id: "archived-property", name: "Former House" },
        { archived_at: null, code: "RIV", id: "active-property", name: "Riverside House" },
      ],
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "finance_accounts") return accountQuery;
        if (table === "properties") return propertiesQuery;
        return chainQuery({ data: [], error: null });
      }),
    });

    const data = await getFinanceAccountsData("org-1");
    const historicalAccount = data.groups
      .find((group) => group.accountClass === "asset")
      ?.accounts.find((account) => account.id === "historical-account");

    expect(historicalAccount?.propertyLabel).toBe("OLD · Former House");
    expect(data.properties).toEqual([
      { id: "active-property", label: "RIV · Riverside House" },
    ]);
    expect(propertiesQuery.select).toHaveBeenCalledWith("id, code, name, archived_at");
  });

  it("rejects account hierarchies deeper than one supported child level", async () => {
    // Break caught: silently rendering a third nesting level hides corrupt
    // hierarchy data behind a UI that only supports parent and sub-account.
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) =>
        chainQuery({
          data:
            table === "finance_accounts"
              ? [
                  accountRow({ id: "parent" }),
                  accountRow({ id: "child", parent_account_id: "parent" }),
                  accountRow({ id: "grandchild", parent_account_id: "child" }),
                ]
              : [],
          error: null,
        }),
      ),
    });

    await expect(getFinanceAccountsData("org-1")).rejects.toThrow(
      "Could not load Chart of Accounts.",
    );
  });
});

describe("finance account selectors", () => {
  const accounts: FinanceAccountSummary[] = [
    summary({ accountClass: "asset", accountSubtype: "bank", displayName: "Operating account", id: "bank" }),
    summary({ accountClass: "asset", accountSubtype: "petty_cash", displayName: "Petty cash", id: "cash" }),
    summary({ accountClass: "liability", accountSubtype: "credit_card", displayName: "Company Visa", id: "card" }),
    summary({ accountClass: "expense", accountSubtype: "expense", displayName: "Plumbing", id: "expense" }),
    summary({
      accountClass: "income",
      accountSubtype: "income",
      displayName: "Rental income",
      id: "income",
      useForLeaseCharges: true,
    }),
    summary({
      accountClass: "liability",
      accountSubtype: "current_liability",
      displayName: "Security deposits",
      id: "deposit",
      useForLeaseDeposits: true,
    }),
    summary({
      accountClass: "asset",
      accountSubtype: "bank",
      archivedAt: "2026-09-01T00:00:00.000Z",
      displayName: "Closed bank account",
      id: "archived-bank",
    }),
    summary({
      accountClass: "expense",
      accountSubtype: "expense",
      archivedAt: "2026-09-01T00:00:00.000Z",
      displayName: "Archived expense",
      id: "archived-expense",
      useForLeaseCredits: true,
    }),
  ];

  it("keeps incompatible accounts out of daily-work selectors", () => {
    // Break caught: accepting inactive or incompatible accounts lets new work
    // bypass the chart's workflow boundaries.
    expect(getPayFromAccountOptions(accounts).map((item) => item.displayName)).toEqual([
      "Operating account",
      "Petty cash",
      "Company Visa",
    ]);
    expect(getExpenseAccountOptions(accounts).every((item) => item.accountClass === "expense")).toBe(true);
    expect(getExpenseAccountOptions(accounts).map((item) => item.displayName)).toEqual(["Plumbing"]);
    expect(getLeaseChargeAccountOptions(accounts).map((item) => item.displayName)).toEqual([
      "Rental income",
    ]);
    expect(getLeaseDepositAccountOptions(accounts).map((item) => item.displayName)).toEqual([
      "Security deposits",
    ]);
  });
});

function accountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    account_class: "asset",
    account_number: null,
    account_subtype: "bank",
    archived_at: null,
    description: null,
    display_name: "Account",
    id: "account-id",
    parent_account_id: null,
    property_id: null,
    system_role: null,
    use_for_lease_charges: false,
    use_for_lease_credits: false,
    use_for_lease_deposits: false,
    ...overrides,
  };
}

function summary(
  overrides: Partial<FinanceAccountSummary> = {},
): FinanceAccountSummary {
  return {
    accountClass: "asset",
    accountNumber: null,
    accountSubtype: "bank",
    archivedAt: null,
    defaultFor: [],
    depth: 0,
    description: null,
    displayName: "Account",
    id: "account-id",
    parentAccountId: null,
    propertyId: null,
    propertyLabel: null,
    systemRole: null,
    useForLeaseCharges: false,
    useForLeaseCredits: false,
    useForLeaseDeposits: false,
    ...overrides,
  };
}

function chainQuery(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}
