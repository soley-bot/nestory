// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FinanceOperationsScreen } from "./finance-operations-screen";
import type { FinanceOperationsData } from "../finance-operations.types";

beforeAll(() => {
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  }
});

afterEach(cleanup);

describe("FinanceOperationsScreen", () => {
  it("starts from a compact finance work queue and opens the four-step lease setup", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Finance workspace",
    });
    expect(
      within(navigation)
        .getByRole("link", { name: "Finance work" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText("Set up lease billing")).not.toBeNull();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Post")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(
      screen.getByRole("dialog", { name: "Set up lease billing" }),
    ).not.toBeNull();
    expect(screen.getByText("Property & owner")).not.toBeNull();
    expect(screen.getByText("Sokha Owner")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close drawer" })).not.toBeNull();
    expect(
      screen
        .getByLabelText("Step 1 of 4: Property & owner")
        .getAttribute("aria-current"),
    ).toBe("step");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getAllByText("Collected by Sokha Property Services").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Collected by owner").length).toBeGreaterThan(0);
  });

  it("keeps the expense drawer plain and reveals billing only when needed", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(screen.getByRole("dialog", { name: "Add expense" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close drawer" })).not.toBeNull();
    expect(screen.getByText("Charge this to")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Property owner" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Tenant or company" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByLabelText("Amount paid")).not.toBeNull();
    expect(screen.queryByText("Internal breakdown")).toBeNull();
    expect(screen.queryByText("Service fee")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tenant or company" }));
    expect(screen.getByText("Service fee")).not.toBeNull();
    expect(screen.getByText("Invoice line")).not.toBeNull();
    expect(screen.getByText("No open invoice")).not.toBeNull();
  });

  it("keeps invoice selection inside the record payment modal", () => {
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    const headerActions = document.querySelector<HTMLElement>(
      '[data-slot="page-header-actions"]',
    );
    expect(headerActions).not.toBeNull();
    fireEvent.click(
      within(headerActions!).getByRole("button", { name: "Record payment" }),
    );
    const chooser = screen.getByRole("dialog", { name: "Record payment" });
    fireEvent.click(within(chooser).getByText("Sokha Trading Co.").closest("button")!);

    expect(screen.getByRole("dialog", { name: "Record payment" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Choose another" })).not.toBeNull();
  });

  it("shows direct-owner collection without pretending IPS received cash", () => {
    const input = data();
    input.leases[0].billing = {
      billingRecipientKind: "company",
      billingRecipientPersonId: "person-company",
      chargeManagementFeeWhenActive: true,
      collectionRoute: "direct_to_owner",
      effectiveFrom: "2026-08-01",
      finalPeriodProratedAmount: null,
      firstPeriodProratedAmount: null,
      fullManagementFeeDuringProration: true,
      id: "billing-1",
      managementFeeMode: "flat",
      managementFeeValue: 65,
    };
    input.tenantInvoices = [tenantInvoice()];

    render(
      <FinanceOperationsScreen
        {...input}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.getByText("Sokha Trading Co.")).not.toBeNull();
    expect(screen.getByText("Occupants: Dara Tenant")).not.toBeNull();
    expect(screen.getByText("Collected by owner")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirm collected" }),
    ).not.toBeNull();
  });

  it("keeps owner cash, owner debt, and withdrawal availability separate", () => {
    const input = data();
    const partialInvoice = tenantInvoice();
    partialInvoice.balanceDue = 540;
    partialInvoice.collectedByOwner = 0;
    partialInvoice.collectionRoute = "through_ips";
    partialInvoice.paidThroughIps = 100;
    partialInvoice.paymentStatus = "partly_paid";
    input.tenantInvoices = [partialInvoice];

    render(
      <FinanceOperationsScreen
        {...input}
        organizationName="Sokha Property Services"
        view="balances"
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Owner funds held" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Owner amount due" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Available" }),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("link", { name: "HOME — Riverside Home" })
        .getAttribute("href"),
    ).toBe("/properties/property-1/account");
    fireEvent.click(
      screen.getByRole("button", { name: "Tenants & companies" }),
    );
    expect(screen.getByText("Partly paid")).not.toBeNull();
  });
});

function data(): FinanceOperationsData {
  return {
    accountEntries: [],
    expenses: [],
    leases: [
      {
        billing: null,
        endDate: "2027-07-31",
        id: "lease-1",
        monthlyRent: 780,
        ownerLabel: "Sokha Owner",
        ownerPersonId: "person-owner",
        propertyId: "property-1",
        propertyLabel: "HOME — Riverside Home",
        startDate: "2026-08-01",
        status: "active",
        tenantLabel: "Dara Tenant",
        tenantPersonId: "person-tenant",
        unitId: "unit-1",
        unitLabel: "HOME — Unit 01",
      },
    ],
    ownerInvoices: [],
    peopleOptions: [
      { id: "person-tenant", label: "Dara Tenant" },
      { id: "person-company", label: "Sokha Trading Co." },
    ],
    positions: [
      {
        availableWithdrawal: 502,
        cashHeldByIps: 502,
        managementFeeExpense: 78,
        ownerExpense: 200,
        ownerLabel: "Sokha Owner",
        ownerOwesIps: 0,
        ownerPersonId: "person-owner",
        propertyId: "property-1",
        propertyLabel: "HOME — Riverside Home",
        rentIncome: 780,
        runningBalance: 502,
        withdrawals: 0,
      },
    ],
    propertyOptions: [{ id: "property-1", label: "HOME — Riverside Home" }],
    reconciliationSources: [
      { id: "source-1", label: "BANK · Operating", propertyId: "property-1" },
    ],
    tenantInvoices: [],
    unitOptions: [
      { id: "unit-1", label: "HOME — Unit 01", propertyId: "property-1" },
    ],
  };
}

function tenantInvoice(): FinanceOperationsData["tenantInvoices"][number] {
  return {
    balanceDue: 640,
    collectedByOwner: 0,
    collectionRoute: "direct_to_owner",
    dueDate: "2026-08-05",
    id: "invoice-1",
    invoiceNumber: "INV-202608-001",
    issueDate: "2026-08-01",
    leaseId: "lease-1",
    lines: [
      {
        amount: 640,
        balanceDue: 640,
        id: "line-1",
        label: "Rent",
        lineType: "rent",
      },
    ],
    occupantLabels: ["Dara Tenant"],
    paidThroughIps: 0,
    paymentStatus: "unpaid",
    propertyId: "property-1",
    propertyLabel: "HOME — Riverside Home",
    recipientLabel: "Sokha Trading Co.",
    totalAmount: 640,
    unitId: "unit-1",
    unitLabel: "HOME — Unit 01",
  };
}
