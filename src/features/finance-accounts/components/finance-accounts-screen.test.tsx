/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceAccountsData, FinanceAccountSummary } from "@/features/finance-accounts/finance-accounts.types";

const mocks = vi.hoisted(() => ({
  createFinanceAccountAction: vi.fn(),
  setFinanceAccountArchivedAction: vi.fn(),
  updateFinanceAccountAction: vi.fn(),
}));

vi.mock("@/features/finance-accounts/actions", () => ({
  createFinanceAccountAction: mocks.createFinanceAccountAction,
  setFinanceAccountArchivedAction: mocks.setFinanceAccountArchivedAction,
  updateFinanceAccountAction: mocks.updateFinanceAccountAction,
}));

import { FinanceAccountsScreen } from "@/features/finance-accounts/components/finance-accounts-screen";

afterEach(cleanup);

describe("FinanceAccountsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFinanceAccountAction.mockResolvedValue({});
    mocks.setFinanceAccountArchivedAction.mockResolvedValue({});
    mocks.updateFinanceAccountAction.mockResolvedValue({});
  });

  it("presents a plain grouped Chart of Accounts", () => {
    // Break caught: replacing the accounting hierarchy with a flat or legacy
    // cash-location screen makes the catalog harder to scan and understand.
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts />);

    expect(screen.getByRole("heading", { name: "Chart of Accounts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New account" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Assets" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Equity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Expenses" })).toBeTruthy();
    expect(screen.getByText("Repairs and maintenance")).toBeTruthy();
    expect(screen.getByText("Plumbing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Repairs and maintenance" })).toBeTruthy();
    expect(screen.queryByText(/funding source/i)).toBeNull();
    expect(screen.queryByText(/operational cash/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Activity for Operating account" }).getAttribute("href"))
      .toBe("/finance/accounts/asset-active");
  });

  it("shows only relevant workflow fields for each account type", async () => {
    // Break caught: exposing every workflow flag for every type lets operators
    // submit combinations that the checked account actions must reject.
    const user = userEvent.setup();
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts />);

    await user.click(screen.getByRole("button", { name: "New account" }));
    const drawer = screen.getByRole("dialog");
    await user.selectOptions(within(drawer).getByLabelText("Account type"), "expense:expense");
    expect(within(drawer).getByLabelText("Use for lease credits")).toBeTruthy();
    expect(within(drawer).queryByLabelText("Use for lease charges")).toBeNull();
    expect(within(drawer).queryByLabelText("Available to")).toBeNull();

    await user.selectOptions(within(drawer).getByLabelText("Account type"), "liability:current_liability");
    expect(within(drawer).getByLabelText("Use for lease deposits")).toBeTruthy();
    expect(within(drawer).queryByLabelText("Use for lease credits")).toBeNull();

    await user.selectOptions(within(drawer).getByLabelText("Account type"), "asset:bank");
    expect(within(drawer).getByLabelText("Available to")).toBeTruthy();
    expect(within(drawer).getByRole("option", { name: "HIL · Hill House" })).toBeTruthy();
    expect(within(drawer).queryByLabelText("Use for lease deposits")).toBeNull();
  });

  it("submits a selected compatible replacement for a protected default", async () => {
    // Break caught: hiding lifecycle controls for defaults prevents the checked
    // RPC from atomically moving a role to a compatible replacement.
    let payload: Record<string, FormDataEntryValue> | null = null;
    mocks.setFinanceAccountArchivedAction.mockImplementation(async (_state, formData) => {
      payload = Object.fromEntries(formData.entries());
      return { message: "Account made inactive.", status: "success" };
    });
    const user = userEvent.setup();
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts />);

    await user.click(screen.getByRole("button", { name: "Make inactive Rental income" }));
    const drawer = screen.getByRole("dialog", { name: "Make account inactive" });
    await user.selectOptions(
      within(drawer).getByLabelText("Replacement account"),
      "income-replacement",
    );
    expect(within(drawer).queryByRole("option", { name: "Former rent income" })).toBeNull();
    expect(within(drawer).queryByRole("option", { name: "Other income" })).toBeNull();
    await user.click(within(drawer).getByRole("button", { name: "Make inactive" }));

    expect((await within(drawer).findByRole("status")).textContent).toContain("Account made inactive.");
    expect(payload).toEqual({
      accountId: "income",
      archived: "true",
      replacementAccountId: "income-replacement",
    });
  });

  it("retains the replacement selection and shows expected failure visibly", async () => {
    // Break caught: a failed checked mutation previously left feedback hidden
    // and gave the operator no editable replacement selection to correct.
    mocks.setFinanceAccountArchivedAction.mockResolvedValue({
      fieldErrors: {
        replacementAccountId: ["Choose an active replacement with the same account type."],
      },
      status: "error",
    });
    const user = userEvent.setup();
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts />);

    await user.click(screen.getByRole("button", { name: "Make inactive Rental income" }));
    const drawer = screen.getByRole("dialog", { name: "Make account inactive" });
    const replacement = within(drawer).getByLabelText("Replacement account") as HTMLSelectElement;
    await user.selectOptions(replacement, "income-replacement");
    await user.click(within(drawer).getByRole("button", { name: "Make inactive" }));

    expect((await within(drawer).findByRole("alert")).textContent).toContain(
      "Choose an active replacement with the same account type.",
    );
    expect(replacement.value).toBe("income-replacement");
  });

  it("shows property availability only for cash-like Asset account details", async () => {
    // Break caught: rendering availability on every view-only account implies
    // Income, Expense, and non-cash Assets can be scoped to one property.
    const user = userEvent.setup();
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts={false} />);

    await user.click(screen.getByRole("button", { name: "View Undeposited funds" }));
    let drawer = screen.getByRole("dialog", { name: "Account details" });
    expect(within(drawer).queryByText("Available to")).toBeNull();
    await user.click(within(drawer).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "View Operating account" }));
    drawer = screen.getByRole("dialog", { name: "Account details" });
    expect(within(drawer).getByText("Available to")).toBeTruthy();
    expect(within(drawer).getByText("RIV · Riverside House")).toBeTruthy();
  });

  it("reveals a compatible parent only when Sub-account is enabled", async () => {
    // Break caught: an always-visible parent field obscures the primary account
    // details and permits choosing a parent before the account type is known.
    const user = userEvent.setup();
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts />);
    await user.click(screen.getByRole("button", { name: "New account" }));
    const drawer = screen.getByRole("dialog");

    expect(within(drawer).queryByLabelText("Parent account")).toBeNull();
    await user.selectOptions(within(drawer).getByLabelText("Account type"), "expense:expense");
    await user.click(within(drawer).getByLabelText("Sub-account"));
    const parent = within(drawer).getByLabelText("Parent account");
    expect(within(parent).getByRole("option", { name: "Repairs and maintenance" })).toBeTruthy();
  });

  it("filters accounts by search, type, and status", async () => {
    // Break caught: wiring only the visual controls leaves the dense chart
    // impossible to narrow during ordinary account maintenance.
    const user = userEvent.setup();
    render(<FinanceAccountsScreen {...fixture()} canManageAccounts={false} />);

    await user.type(screen.getByRole("searchbox", { name: "Search accounts" }), "former");
    expect(screen.queryByText("Operating account")).toBeNull();
    expect(screen.getByText("No accounts match these filters.")).toBeTruthy();

    await user.clear(screen.getByRole("searchbox", { name: "Search accounts" }));
    await user.selectOptions(screen.getByLabelText("Account status"), "inactive");
    expect(screen.getByText("Former cash account")).toBeTruthy();
    expect(screen.queryByText("Operating account")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Account status"), "all");
    await user.selectOptions(screen.getByLabelText("Account type filter"), "expense");
    expect(screen.getByText("Repairs and maintenance")).toBeTruthy();
    expect(screen.queryByText("Operating account")).toBeNull();
  });
});

function fixture(): FinanceAccountsData {
  return {
    groups: [
      {
        accountClass: "asset",
        accounts: [
          account({
            accountClass: "asset",
            accountNumber: "1000",
            accountSubtype: "bank",
            defaultFor: ["Operating account"],
            displayName: "Operating account",
            id: "asset-active",
            propertyId: "10000000-0000-4000-8000-000000000001",
            propertyLabel: "RIV · Riverside House",
          }),
          account({
            accountClass: "asset",
            accountSubtype: "other_current_asset",
            displayName: "Undeposited funds",
            id: "asset-other-current",
          }),
          account({
            accountClass: "asset",
            accountSubtype: "cash",
            archivedAt: "2026-08-01T00:00:00.000Z",
            displayName: "Former cash account",
            id: "asset-inactive",
          }),
        ],
      },
      {
        accountClass: "liability",
        accounts: [
          account({
            accountClass: "liability",
            accountSubtype: "current_liability",
            displayName: "Security deposits",
            id: "liability",
            useForLeaseDeposits: true,
          }),
        ],
      },
      { accountClass: "equity", accounts: [] },
      {
        accountClass: "income",
        accounts: [
          account({
            accountClass: "income",
            accountSubtype: "income",
            defaultFor: ["Rent income"],
            displayName: "Rental income",
            id: "income",
            systemRole: "Rent income",
            useForLeaseCharges: true,
          }),
          account({
            accountClass: "income",
            accountSubtype: "income",
            displayName: "Lease income reserve",
            id: "income-replacement",
            useForLeaseCharges: true,
          }),
          account({
            accountClass: "income",
            accountSubtype: "income",
            archivedAt: "2026-08-01T00:00:00.000Z",
            displayName: "Former rent income",
            id: "income-inactive",
            useForLeaseCharges: true,
          }),
          account({
            accountClass: "income",
            accountSubtype: "other_income",
            displayName: "Other income",
            id: "income-incompatible",
          }),
        ],
      },
      {
        accountClass: "expense",
        accounts: [
          account({
            accountClass: "expense",
            accountNumber: "6000",
            accountSubtype: "expense",
            description: "Day-to-day upkeep",
            displayName: "Repairs and maintenance",
            id: "expense-parent",
          }),
          account({
            accountClass: "expense",
            accountNumber: "6010",
            accountSubtype: "expense",
            depth: 1,
            displayName: "Plumbing",
            id: "expense-child",
            parentAccountId: "expense-parent",
          }),
        ],
      },
    ],
    properties: [
      { id: "10000000-0000-4000-8000-000000000001", label: "RIV · Riverside House" },
      { id: "20000000-0000-4000-8000-000000000001", label: "HIL · Hill House" },
    ],
  };
}

function account(overrides: Partial<FinanceAccountSummary>): FinanceAccountSummary {
  return {
    accountClass: "asset",
    accountNumber: null,
    accountSubtype: "bank",
    archivedAt: null,
    defaultFor: [],
    defaultRoleCodes: [],
    depth: 0,
    description: null,
    displayName: "Account",
    id: "account-id",
    parentAccountId: null,
    propertyId: null,
    propertyLabel: null,
    systemRole: null,
    systemRoleCode: null,
    useForLeaseCharges: false,
    useForLeaseCredits: false,
    useForLeaseDeposits: false,
    ...overrides,
  };
}
