// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  FinanceCategoryManager,
  FinanceCategorySetupEntry,
} from "./finance-category-manager";
import type { FinanceCategory } from "../finance-operations.types";

afterEach(() => {
  cleanup();
});

describe("historical finance category compatibility", () => {
  it("routes setup to the Chart of Accounts instead of category CRUD", () => {
    render(<FinanceCategorySetupEntry />);

    expect(
      screen.getByRole("link", { name: "Open Chart of Accounts" }).getAttribute("href"),
    ).toBe("/finance/accounts");
    expect(screen.queryByText("Manage categories")).toBeNull();
  });

  it("keeps legacy categories display-only", () => {
    render(<FinanceCategoryManager canManage categories={categories()} />);

    expect(screen.getByRole("heading", { name: "Owner expenses" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tenant billing" })).not.toBeNull();
    expect(screen.getByText("Landscaping")).not.toBeNull();
    expect(screen.getByText("Parking")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

function categories(): FinanceCategory[] {
  return [
    {
      archivedAt: null,
      code: "cleaning",
      displayLabel: "Cleaning",
      id: "category-owner-cleaning",
      isActive: true,
      isDefault: true,
      namespace: "owner_expense",
      reportingGroup: "maintenance",
      sortOrder: 10,
    },
    {
      archivedAt: null,
      code: "custom_landscaping",
      displayLabel: "Landscaping",
      id: "category-owner-landscaping",
      isActive: true,
      isDefault: false,
      namespace: "owner_expense",
      reportingGroup: "maintenance",
      sortOrder: 50,
    },
    {
      archivedAt: null,
      code: "utilities",
      displayLabel: "Utilities",
      id: "category-tenant-utilities",
      isActive: true,
      isDefault: true,
      namespace: "tenant_billing",
      reportingGroup: "utility_reimbursement",
      sortOrder: 10,
    },
    {
      archivedAt: "2026-08-30T00:00:00.000Z",
      code: "custom_parking",
      displayLabel: "Parking",
      id: "category-tenant-parking",
      isActive: false,
      isDefault: false,
      namespace: "tenant_billing",
      reportingGroup: "parking",
      sortOrder: 50,
    },
  ];
}
