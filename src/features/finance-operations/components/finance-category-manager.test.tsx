// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const financeActionMocks = vi.hoisted(() => ({
  updateFinanceCategoryAction: vi.fn(),
}));

vi.mock("../actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../actions")>();
  return {
    ...actual,
    updateFinanceCategoryAction:
      financeActionMocks.updateFinanceCategoryAction,
  };
});

import { FinanceCategoryManager } from "./finance-category-manager";
import type { FinanceCategory } from "../finance-operations.types";

afterEach(() => {
  cleanup();
  financeActionMocks.updateFinanceCategoryAction.mockReset();
});

describe("FinanceCategoryManager", () => {
  it("separates protected system categories from archivable custom categories", () => {
    render(<FinanceCategoryManager canManage categories={categories()} />);

    expect(screen.getByRole("heading", { name: "Owner expenses" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tenant billing" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Add owner expense category" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Add tenant billing category" }),
    ).not.toBeNull();

    const ownerSystem = screen.getByRole("region", {
      name: "Owner expense system categories",
    });
    expect(within(ownerSystem).getByText("System categories")).not.toBeNull();
    expect(
      within(ownerSystem).getByText(
        "Built in for consistent reporting. Labels can be renamed, but these categories cannot be archived.",
      ),
    ).not.toBeNull();
    expect(
      within(ownerSystem).getByRole("textbox", { name: "Rename Cleaning" }),
    ).not.toBeNull();
    expect(
      within(ownerSystem).queryByRole("button", { name: "Archive Cleaning" }),
    ).toBeNull();
    expect(within(ownerSystem).getAllByText("System")).toHaveLength(1);

    const ownerCustom = screen.getByRole("region", {
      name: "Owner expense custom categories",
    });
    expect(within(ownerCustom).getByText("Custom categories")).not.toBeNull();
    expect(within(ownerCustom).getByText("Custom")).not.toBeNull();
    const archive = within(ownerCustom).getByRole("button", {
      name: "Archive Landscaping",
    });
    expect(archive.getAttribute("data-size")).toBe("default");

    const tenantCustom = screen.getByRole("region", {
      name: "Tenant billing custom categories",
    });
    expect(
      within(tenantCustom).getByRole("button", { name: "Restore Parking" }),
    ).not.toBeNull();
    expect(within(tenantCustom).getByText("Archived")).not.toBeNull();
    expect(screen.queryByText("Default category")).toBeNull();
  });

  it("announces category action results without moving focus", async () => {
    const user = userEvent.setup();
    financeActionMocks.updateFinanceCategoryAction.mockResolvedValueOnce({
      message: "Finance category renamed.",
      status: "success",
    });
    render(<FinanceCategoryManager canManage categories={categories()} />);

    const ownerSystem = screen.getByRole("region", {
      name: "Owner expense system categories",
    });
    const rename = within(ownerSystem).getByRole("button", {
      name: "Rename Cleaning",
    });
    rename.focus();
    await user.keyboard("{Enter}");

    const announcement = await within(ownerSystem).findByRole("status");
    expect(announcement.textContent).toBe("Finance category renamed.");
    expect(announcement.getAttribute("aria-live")).toBe("polite");
    expect(document.activeElement).toBe(rename);
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
