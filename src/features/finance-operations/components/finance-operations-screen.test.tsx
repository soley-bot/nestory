// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";

const financeActionMocks = vi.hoisted(() => ({
  publishTenantInvoicePdfAction: vi.fn(),
  recordTenantInvoicePaymentAction: vi.fn(),
  retryTenantReceiptPdfAction: vi.fn(),
}));

vi.mock("../actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../actions")>();
  return {
    ...actual,
    publishTenantInvoicePdfAction: financeActionMocks.publishTenantInvoicePdfAction,
    recordTenantInvoicePaymentAction:
      financeActionMocks.recordTenantInvoicePaymentAction,
    retryTenantReceiptPdfAction: financeActionMocks.retryTenantReceiptPdfAction,
  };
});

vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} data-next-link="true">
      {children}
    </a>
  ),
}));

import { FinanceOperationsScreen } from "./finance-operations-screen";
import type { FinanceOperationsData } from "../finance-operations.types";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  }
});

afterEach(() => {
  cleanup();
  financeActionMocks.publishTenantInvoicePdfAction.mockReset();
  financeActionMocks.recordTenantInvoicePaymentAction.mockReset();
  financeActionMocks.retryTenantReceiptPdfAction.mockReset();
});

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("FinanceOperationsScreen", () => {
  it("shows a renamed archived tenant-recharge category in the queue and review detail", async () => {
    const user = userEvent.setup();
    const input = data();
    input.expenseSubmissions = [
      {
        ...expenseSubmission("submitted"),
        category: "custom_water_recharge_7d1b",
        categoryLabel: "Resident water recharge",
        responsibility: "tenant",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canReviewExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(screen.getByText("Resident water recharge")).not.toBeNull();
    expect(screen.queryByText("Custom water recharge 7d1b")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Review Sokha Repairs" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Resident water recharge")).not.toBeNull();
    expect(within(dialog).queryByText("Custom water recharge 7d1b")).toBeNull();
  });

  it("shows the current renamed label for an archived custom owner category in review", async () => {
    const user = userEvent.setup();
    const input = data();
    input.expenseSubmissions = [
      {
        ...expenseSubmission("submitted"),
        category: "custom_courtyard_4f2a",
        categoryLabel: "Courtyard upkeep",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canReviewExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(screen.getByText("Courtyard upkeep")).not.toBeNull();
    expect(screen.queryByText("Custom courtyard 4f2a")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Review Sokha Repairs" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Courtyard upkeep")).not.toBeNull();
    expect(within(dialog).queryByText("Custom courtyard 4f2a")).toBeNull();
  });

  it("keeps owner-expense and tenant-billing category choices in separate workflows", async () => {
    const user = userEvent.setup();
    const input = data();
    input.financeCategories = [
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
        code: "custom_parking",
        displayLabel: "Parking",
        id: "category-tenant-parking",
        isActive: true,
        isDefault: false,
        namespace: "tenant_billing",
        reportingGroup: "parking",
        sortOrder: 50,
      },
    ];
    input.tenantInvoices = [tenantInvoice()];

    const owner = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canSubmitExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Record property expense" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Paid-cost category" }));
    expect(screen.getByRole("option", { name: "Landscaping" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Parking" })).toBeNull();
    owner.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Bill tenant" }));
    await user.click(screen.getByRole("combobox", { name: "Charge type" }));
    expect(screen.getByRole("option", { name: "Parking" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Landscaping" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Manual rent" })).toBeNull();
  });

  it("opens a namespace-explicit category surface from Finance", async () => {
    const user = userEvent.setup();
    const input = data();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        canManageFinanceCategories
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Finance categories" }));
    const drawer = screen.getByRole("dialog", { name: "Finance categories" });
    expect(within(drawer).getByRole("heading", { name: "Owner expenses" })).not.toBeNull();
    expect(within(drawer).getByRole("heading", { name: "Tenant billing" })).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Add owner expense category" })).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Add tenant billing category" })).not.toBeNull();
    const tenantSection = within(drawer)
      .getByRole("heading", { name: "Tenant billing" })
      .closest("section");
    expect(tenantSection).not.toBeNull();
    expect(
      within(tenantSection!).getAllByText("Other tenant charge").length,
    ).toBeGreaterThan(0);
    expect(
      within(tenantSection!).queryByText("Other owner expense"),
    ).toBeNull();
  });

  it("uses the shared responsive workspace gutters and compact summary sizing", () => {
    const input = data();
    const { container, rerender } = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    const workSurface = container.querySelector<HTMLElement>(
      '[data-slot="finance-work-surface"]',
    );
    const pageHeader = container
      .querySelector('[data-slot="page-header-primary-row"]')
      ?.closest("header");
    expect(pageHeader?.className).toContain("px-4");
    expect(pageHeader?.className).toContain("sm:px-6");
    expect(pageHeader?.className).toContain("2xl:px-8");
    const workLayout = workSurface?.parentElement;
    expect(workLayout?.className).toContain("px-4");
    expect(workLayout?.className).toContain("sm:px-6");
    expect(workLayout?.className).toContain("2xl:px-8");
    expect(workLayout?.className).toContain("gap-3");
    const summary = screen.getByRole("region", { name: "Finance summary" });
    expect(summary.firstElementChild?.className).toContain("py-2.5");
    expect(summary.className).toContain("rounded-xl");
    expect(summary.className).toContain("bg-card");
    expect(summary.className).toContain("shadow-sm");

    rerender(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    const rentSurface = container.querySelector<HTMLElement>(
      '[data-slot="rent-invoices-surface"]',
    );
    expect(rentSurface?.parentElement?.className).toContain("px-4");
    expect(rentSurface?.parentElement?.className).toContain("sm:px-6");
    expect(rentSurface?.parentElement?.className).toContain("2xl:px-8");
  });

  it("keeps the work queue summary focused on open work and payment ownership", () => {
    const input = data();
    input.leases[0].billing = billing();
    input.tenantInvoices = [tenantInvoice()];
    input.ownerInvoices = [
      {
        balanceDue: 200,
        dueDate: "2026-08-10",
        id: "owner-invoice-summary",
        invoiceNumber: "OWNER-SUMMARY",
        ownerLabel: "Sokha Owner",
        ownerPersonId: "person-owner",
        paidByOwner: 0,
        paidFromHeldCash: 0,
        paymentStatus: "unpaid",
        propertyId: "property-1",
        propertyLabel: "HOME — Riverside Home",
        totalAmount: 200,
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    const summary = screen.getByRole("region", { name: "Finance summary" });
    expect(within(summary).getByText("Open work")).not.toBeNull();
    expect(within(summary).getByText("Tenant payments")).not.toBeNull();
    expect(within(summary).getByText("Owner invoice payments")).not.toBeNull();
    expect(within(summary).queryByText("Needs setup")).toBeNull();
    expect(within(summary).queryByText("Rent exceptions")).toBeNull();
  });

  it("keeps portfolio review free of transaction creation actions", () => {
    const input = data();
    input.tenantInvoices = [tenantInvoice()];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Record tenant payment" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Bill tenant" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Review tenant payment" }),
    ).not.toBeNull();
  });

  it("shows automatic-rent exceptions without restoring a manual invoice path", () => {
    const input = data();
    input.leases[0].billing = billing();
    input.rentGenerationExceptions = [
      {
        attemptCount: 2,
        billingPeriodStart: "2026-09-01",
        code: "billing_recipient_invalid",
        id: "exception-1",
        lastAttemptAt: "2026-09-01T01:00:00Z",
        leaseId: "lease-1",
        message: "Select an active billing recipient for the lease.",
        propertyId: "property-1",
      },
    ];

    const readOnly = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        canConfigureRent={false}
        canRecoverRent={false}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    expect(screen.getByText("Rent generation needs attention")).not.toBeNull();
    expect(
      screen.getByText("Select an active billing recipient for the lease."),
    ).not.toBeNull();
    expect(screen.getByText("Sep 2026")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryByText("Create rent invoice")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    readOnly.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        canConfigureRent={false}
        canRecoverRent={false}
        canRetryCurrentRent
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Generate missing rent for Sep 2026",
      }),
    ).not.toBeNull();
  });

  it("keeps lease context in invoice details instead of expanding every rent row", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.billingPeriodStart = "2026-08-01";
    invoice.generationSource = "scheduled";
    invoice.isProrated = true;
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        canConfigureRent={false}
        canRecoverRent={false}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.queryByText("Generated automatically")).toBeNull();
    expect(screen.queryByText("Aug 2026 lease month")).toBeNull();
    expect(screen.queryByText("Prorated")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "View invoice INV-202608-001",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Invoice details" });
    expect(
      within(dialog).getByRole("heading", { name: "Charges" }),
    ).not.toBeNull();
    expect(within(dialog).getByText("Rent")).not.toBeNull();
    expect(within(dialog).getAllByText("USD 640.00").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Aug 2026 lease month")).not.toBeNull();
    expect(within(dialog).getByText("Prorated")).not.toBeNull();
    expect(
      within(dialog)
        .getByRole("link", { name: "Open Property finance" })
        .getAttribute("href"),
    ).toBe("/properties/property-1/finance?view=rent");
    expect(
      within(dialog)
        .getByRole("link", { name: "Open Unit finance" })
        .getAttribute("href"),
    ).toBe("/units/unit-1/finance?view=rent");
    expect(screen.queryByText(/journal|month close|uuid/i)).toBeNull();
  });

  it("focuses the setup handoff on the exact lease and its first payment", async () => {
    const user = userEvent.setup();
    const input = data();
    const focused = tenantInvoice();
    focused.invoiceNumber = "INV-FOCUSED";
    focused.recipientLabel = "Focused Tenant";
    const unrelated = tenantInvoice();
    unrelated.id = "invoice-2";
    unrelated.invoiceNumber = "INV-UNRELATED";
    unrelated.leaseId = "lease-2";
    unrelated.recipientLabel = "Other Tenant";
    input.tenantInvoices = [focused, unrelated];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        initialRentLeaseId="lease-1"
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.getByText("INV-FOCUSED")).not.toBeNull();
    expect(screen.queryByText("INV-UNRELATED")).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "First rent charge · Dara Tenant",
      }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Recover missed month" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Bill tenant" }),
    ).toBeNull();
    expect(
      screen.getAllByText("1 invoice", { exact: true }).length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Record tenant payment" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Confirm owner collection" });
    expect(within(dialog).getByText("INV-FOCUSED")).not.toBeNull();
    expect(within(dialog).queryByText("INV-UNRELATED")).toBeNull();
  });

  it("keeps manual tenant charges behind payment-recording authority", async () => {
    const user = userEvent.setup();
    const input = data();

    const leaseTermsOnly = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Bill tenant" }),
    ).toBeNull();
    leaseTermsOnly.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bill tenant" }));
    const dialog = screen.getByRole("dialog", { name: "Bill tenant" });
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="leaseId"]')?.value,
    ).toBe("");
    expect(
      within(dialog).getByRole("combobox", { name: "Charge type" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Billing month" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Due date" }),
    ).not.toBeNull();
    const amount = within(dialog).getByLabelText("Amount");
    expect(amount.getAttribute("placeholder")).toBe("0.00");
    expect(amount.className).toContain("text-lg");
    await user.click(
      within(dialog).getByRole("combobox", { name: "Charge type" }),
    );
    expect(screen.queryByText("Manual rent")).toBeNull();
    expect(screen.getAllByText("Utilities").length).toBeGreaterThan(0);
  });

  it("distinguishes overdue rent from a payment completed after its due date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T05:00:00Z"));

    try {
      const input = data();
      const overdue = tenantInvoice();
      overdue.id = "invoice-overdue";
      overdue.invoiceNumber = "INV-OVERDUE";
      overdue.dueDate = "2026-08-05";
      overdue.paymentStatus = "unpaid";

      const paidLate = tenantInvoice();
      paidLate.id = "invoice-paid-late";
      paidLate.invoiceNumber = "INV-PAID-LATE";
      paidLate.balanceDue = 0;
      paidLate.dueDate = "2026-08-05";
      paidLate.paidThroughIps = 640;
      paidLate.paymentStatus = "paid";
      paidLate.settlements = [
        {
          amount: 640,
          date: "2026-08-09",
          id: "payment-late",
          isReversed: false,
          reference: "Bank receipt",
          receipt: {
            artifactId: null,
            href: null,
            publicationStatus: "not_published",
            publishedAt: null,
          },
          receiptNumber: null,
          reversalReason: null,
          route: "through_ips",
        },
      ];
      const partialOverdue = tenantInvoice();
      partialOverdue.id = "invoice-partial-overdue";
      partialOverdue.invoiceNumber = "INV-PARTIAL-OVERDUE";
      partialOverdue.balanceDue = 25;
      partialOverdue.dueDate = "2026-08-05";
      partialOverdue.paidThroughIps = 615;
      partialOverdue.paymentStatus = "partly_paid";
      input.tenantInvoices = [overdue, partialOverdue, paidLate];

      render(
        <FinanceOperationsScreen
          {...input}
          {...financeCapabilities()}
          organizationName="Sokha Property Services"
          view="rent"
        />,
      );

      const overdueRow = screen.getByText("INV-OVERDUE").closest("tr");
      const paidLateRow = screen.getByText("INV-PAID-LATE").closest("tr");
      const partialOverdueRow = screen
        .getByText("INV-PARTIAL-OVERDUE")
        .closest("tr");
      expect(overdueRow).not.toBeNull();
      expect(paidLateRow).not.toBeNull();
      expect(partialOverdueRow).not.toBeNull();
      expect(within(overdueRow!).getByText("Overdue")).not.toBeNull();
      expect(
        within(partialOverdueRow!).getByText("Partly paid · overdue"),
      ).not.toBeNull();
      expect(within(paidLateRow!).getByText("Paid late")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not expose missing-rent recovery as a permanent rent action", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canRecoverRent: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /generate missing rent/i }),
    ).toBeNull();
  });

  it("keeps the active lease selected when adding a charge from unit finance", async () => {
    const user = userEvent.setup();
    const input = data();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        scope={{
          id: "unit-1",
          kind: "unit",
          label: "Unit 01",
          propertyId: "property-1",
          propertyLabel: "HOME — Riverside Home",
        }}
        view="rent"
      />,
    );

    expect(
      screen.queryByRole("navigation", { name: "Setup progress" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Bill tenant" }));
    const dialog = screen.getByRole("dialog", { name: "Bill tenant" });
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="leaseId"]')?.value,
    ).toBe("lease-1");
    expect(
      within(dialog).queryByRole("combobox", { name: "Lease" }),
    ).toBeNull();
    expect(within(dialog).queryByText("HOME — Riverside Home")).toBeNull();
    expect(within(dialog).queryByText("Unit 01")).toBeNull();
    expect(within(dialog).getByText("Dara Tenant")).not.toBeNull();
  });

  it("binds the only active lease when adding a charge from property finance", async () => {
    const user = userEvent.setup();

    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        scope={{
          id: "property-1",
          kind: "property",
          label: "HOME — Riverside Home",
          propertyId: "property-1",
          propertyLabel: "HOME — Riverside Home",
        }}
        view="rent"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bill tenant" }));
    const dialog = screen.getByRole("dialog", { name: "Bill tenant" });
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="leaseId"]')?.value,
    ).toBe("lease-1");
    expect(
      within(dialog).queryByRole("combobox", { name: "Lease" }),
    ).toBeNull();
    expect(within(dialog).queryByText("HOME — Riverside Home")).toBeNull();
    expect(
      within(dialog).getByText("Dara Tenant · HOME — Unit 01"),
    ).not.toBeNull();
  });

  it("does not offer payment recording when the scoped invoices are settled", () => {
    const input = data();
    input.tenantInvoices = [
      {
        ...tenantInvoice(),
        balanceDue: 0,
        paidThroughIps: 640,
        paymentStatus: "paid",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        scope={{
          id: "unit-1",
          kind: "unit",
          label: "Unit 01",
          propertyId: "property-1",
          propertyLabel: "HOME — Riverside Home",
        }}
        view="rent"
      />,
    );

    const payment = screen.getByRole("button", {
      name: "Record tenant payment",
    });
    expect(payment).toHaveProperty("disabled", true);
    expect(screen.getByText("No open tenant invoices")).not.toBeNull();
  });

  it("states the paid amount instead of leading a settled invoice with zero", () => {
    const props = data();
    props.tenantInvoices = [
      {
        ...tenantInvoice(),
        balanceDue: 0,
        paidThroughIps: 785,
        paymentStatus: "paid",
        totalAmount: 785,
      },
    ];

    render(
      <FinanceOperationsScreen
        {...props}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.getByText("Paid USD 785.00")).not.toBeNull();
    expect(screen.queryByText("of USD 785.00")).toBeNull();
  });

  it("opens lease billing as one compact prefilled form", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Finance workspace",
    });
    expect(
      within(navigation)
        .getByRole("link", { name: "Portfolio review" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText("Set up lease billing")).not.toBeNull();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Post")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(
      screen.getByRole("dialog", { name: "Set up lease billing" }),
    ).not.toBeNull();
    expect(screen.getByText("Sokha Owner")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close drawer" })).not.toBeNull();
    expect(screen.queryByLabelText("Step 1 of 4: Property & owner")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Bill to" }).textContent,
    ).toContain("Individual tenant");
    expect(
      screen.getByRole("combobox", { name: "Recipient" }).textContent,
    ).toContain("Dara Tenant");
    expect(screen.queryByLabelText("Billing effective date")).toBeNull();
    expect(screen.getByText("Begins on the lease start date.")).not.toBeNull();
    expect(screen.getByText("Advanced billing rules")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Save billing rules" }),
    ).not.toBeNull();
  });

  it("submits a legacy snapshot id as the repair token while showing missing authority", () => {
    const input = data();
    input.leases[0]!.expectedCurrentBillingRuleId = "legacy-snapshot-rule";

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    expect(screen.getByText("Set up lease billing")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    const dialog = screen.getByRole("dialog", { name: "Set up lease billing" });
    expect(
      dialog.querySelector<HTMLInputElement>(
        'input[name="expectedCurrentBillingRuleId"]',
      )?.value,
    ).toBe("legacy-snapshot-rule");
    expect(within(dialog).getByText("Begins on the lease start date.")).not.toBeNull();
  });

  it("keeps the Finance billing queue only as a repair shortcut for incomplete rules", () => {
    const input = data();
    input.leases[0]!.billing = {
      ...billing(),
      billingRecipientKind: null,
      billingRecipientPersonId: null,
      collectionRoute: null,
      managementFeeMode: null,
      managementFeeValue: null,
    };

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    expect(screen.getByText("Repair lease billing")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Repair" })).not.toBeNull();
  });

  it("queues an unsupported legacy stop-before-end rule for repair", () => {
    const input = data();
    input.leases[0]!.billing = {
      ...billing(),
      chargeThroughLeaseEnd: false,
    };
    input.leases[0]!.expectedCurrentBillingRuleId = "legacy-false-rule";

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    expect(screen.getByText("Repair lease billing")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Repair" })).not.toBeNull();
  });

  it("repairs an incomplete company lease with the company tenant selected", () => {
    const input = data();
    input.leases[0]!.tenantLabel = "Sokha Trading Co.";
    input.leases[0]!.tenantPersonId = "person-company";
    input.leases[0]!.billing = {
      ...billing(),
      billingRecipientKind: null,
      billingRecipientPersonId: null,
    };

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Repair" }));
    const dialog = screen.getByRole("dialog", { name: "Repair lease billing" });
    expect(
      within(dialog).getByRole("combobox", { name: "Bill to" }).textContent,
    ).toContain("Company");
    expect(
      within(dialog).getByRole("combobox", { name: "Recipient" }).textContent,
    ).toContain("Sokha Trading Co.");
  });

  it("orders outstanding payment work by the oldest due date first", () => {
    const input = data();
    input.leases[0].billing = billing();
    input.tenantInvoices = [
      {
        ...tenantInvoice(),
        dueDate: "2026-08-20",
        id: "invoice-later",
        invoiceNumber: "INV-LATER",
      },
      {
        ...tenantInvoice(),
        dueDate: "2026-08-05",
        id: "invoice-overdue",
        invoiceNumber: "INV-OVERDUE",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    const rows = within(
      screen.getByRole("region", { name: "Finance records" }),
    ).getAllByRole("row");
    expect(rows[1].textContent).toContain("INV-OVERDUE");
    expect(rows[2].textContent).toContain("INV-LATER");
  });

  it("filters the mixed work queue without losing the oldest-first order", async () => {
    const user = userEvent.setup();
    const input = data();
    input.leases[0].billing = billing();
    input.tenantInvoices = [tenantInvoice()];
    input.ownerInvoices = [
      {
        balanceDue: 200,
        dueDate: "2026-08-10",
        id: "owner-invoice-1",
        invoiceNumber: "OWNER-001",
        ownerLabel: "Sokha Owner",
        ownerPersonId: "person-owner",
        paidByOwner: 0,
        paidFromHeldCash: 0,
        paymentStatus: "unpaid",
        propertyId: "property-1",
        propertyLabel: "HOME — Riverside Home",
        totalAmount: 200,
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Filter work queue" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Owner invoice payments" }),
    );

    const region = screen.getByRole("region", { name: "Finance records" });
    expect(within(region).getByText("Owner invoice payment")).not.toBeNull();
    expect(within(region).queryByText("Tenant payment")).toBeNull();
  });

  it("gives tenant and property context the widest rent column", () => {
    const input = data();
    input.tenantInvoices = [tenantInvoice()];

    const { container } = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    const columns = Array.from(
      container.querySelectorAll('[data-slot="rent-invoices-surface"] col'),
    );
    expect(columns.map((column) => column.className)).toEqual([
      "w-[22%]",
      "w-[34%]",
      "w-[12%]",
      "w-[14%]",
      "w-[12%]",
      "w-[6%]",
    ]);
  });

  it("keeps uncommon proration controls collapsed in lease billing", async () => {
    const user = userEvent.setup();
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canConfigureRent: true })}
        organizationName="Sokha Property Services"
        view="work"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Set up" }));

    expect(screen.queryByRole("alert")).toBeNull();
    const advanced = screen
      .getByText("Advanced billing rules", {
        exact: true,
      })
      .closest("details");
    expect(advanced).not.toBeNull();
    expect(advanced?.hasAttribute("open")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Save billing rules" }),
    ).not.toBeNull();
  });

  it("opens the exact lease billing repair supplied by setup readiness", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canConfigureRent: true })}
        initialBillingLeaseId="lease-1"
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    const drawer = screen.getByRole("dialog", {
      name: "Set up lease billing",
    });
    expect(
      drawer.querySelector<HTMLInputElement>('input[name="leaseId"]')?.value,
    ).toBe("lease-1");
  });

  it("previews the owner-borne expense before review", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canSubmitExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Record recoverable cost" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Needs an open tenant invoice")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Record property expense" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Record property expense" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close drawer" })).not.toBeNull();
    expect(screen.queryByText("Already paid")).toBeNull();
    const receiptSection = screen.getByRole("group", {
      name: "Payment evidence",
    });
    expect(receiptSection).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByText("Owner expense")).not.toBeNull();
    expect(screen.getByText("Owner due to company")).not.toBeNull();
    expect(screen.queryByText("Tenant or company")).toBeNull();
    expect(screen.getByLabelText("Paid-cost category")).not.toBeNull();
    expect(screen.getByLabelText("Amount paid")).not.toBeNull();
    expect(screen.getByLabelText("Paid date")).not.toBeNull();
    expect(screen.getByLabelText("Who paid?")).not.toBeNull();
    expect(
      screen.getByLabelText("Receipt or payment reference"),
    ).toHaveProperty("required", true);
    const evidence = screen.getByLabelText("Receipt evidence");
    expect(evidence).toHaveProperty("required", true);
    expect(evidence.getAttribute("accept")).toBe(
      "application/pdf,image/jpeg,image/png,image/webp",
    );
    expect(screen.queryByText("Service fee")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Submit for review" }),
    ).not.toBeNull();
  });

  it("previews a recoverable cost without affecting owner profit and loss", () => {
    const input = data();
    input.tenantInvoices = [
      { ...tenantInvoice(), collectionRoute: "through_ips" },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canSubmitExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record recoverable cost" }),
    );
    const drawer = screen.getByRole("dialog", {
      name: "Record recoverable cost",
    });
    expect(within(drawer).getByText("Company cost")).not.toBeNull();
    expect(within(drawer).getByText("Tenant invoice")).not.toBeNull();
    expect(within(drawer).getByText("Service fee")).not.toBeNull();
    expect(within(drawer).getByText("Owner P&L")).not.toBeNull();
    expect(within(drawer).getByText("No impact")).not.toBeNull();
    expect(within(drawer).queryByText("Tenant or company")).toBeNull();
  });

  it("keeps a property-scoped paid cost inside the finance flow", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canSubmitExpense: true })}
        organizationName="Sokha Property Services"
        scope={{
          id: "property-1",
          kind: "property",
          label: "HOME — Riverside Home",
          propertyId: "property-1",
          propertyLabel: "HOME — Riverside Home",
        }}
        view="expenses"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record property expense" }),
    );
    const drawer = screen.getByRole("dialog", {
      name: "Record property expense",
    });
    const form = within(drawer).getByRole("form", {
      name: "Record property expense form",
    });

    expect(
      within(form).queryByRole("navigation", { name: "Setup progress" }),
    ).toBeNull();
    expect(
      within(form).queryByRole("combobox", { name: "Property" }),
    ).toBeNull();
    expect(within(form).getByText("HOME — Riverside Home")).not.toBeNull();
    expect(
      within(form).getByRole("heading", { name: "Cost record" }),
    ).not.toBeNull();
    expect(
      within(form).getByRole("heading", { name: "Payment" }),
    ).not.toBeNull();
    expect(
      within(form).getByRole("heading", { name: "Financial preview" }),
    ).not.toBeNull();
    expect(
      within(form).getByRole("heading", { name: "Payment evidence" }),
    ).not.toBeNull();
    expect(within(form).getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(within(form).queryByText("No changes")).not.toBeNull();
    for (const section of form.querySelectorAll('[data-slot="form-section"]')) {
      expect(section.lastElementChild?.className).not.toContain("sm:pl-10");
      expect(section.className).toContain("rounded-xl");
      expect(section.className).toContain("bg-card");
    }
  });

  it("lets Finance Members submit paid costs without exposing review controls", () => {
    const input = data();
    input.expenseSubmissions = [expenseSubmission("submitted")];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canSubmitExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Record property expense" }),
    ).not.toBeNull();
    expect(screen.getByText("Awaiting approval")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "View Sokha Repairs" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /approve sokha repairs/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /reject sokha repairs/i }),
    ).toBeNull();
  });

  it("keeps paid-cost rows compact and moves evidence and decisions into details", async () => {
    const user = userEvent.setup();
    const input = data();
    input.expenseSubmissions = [
      {
        ...expenseSubmission("submitted"),
        evidence: {
          documentId: "document-1",
          fileName: "receipt.pdf",
          href: "https://example.test/signed-receipt",
          mimeType: "application/pdf",
          sha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          sizeBytes: 128,
        },
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canReviewExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "Date",
      "Paid cost",
      "Property / charged to",
      "Amount",
      "Status",
    ]);
    expect(screen.queryByRole("link", { name: "receipt.pdf" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve Sokha Repairs" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Review Sokha Repairs" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Paid cost details" });
    expect(
      within(dialog).getByRole("link", { name: "receipt.pdf" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Approve Sokha Repairs" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Reject Sokha Repairs" }),
    ).not.toBeNull();
    expect(screen.queryByText("Audit details")).toBeNull();
    expect(screen.queryByText("128 bytes")).toBeNull();
  });

  it("lets Finance Managers approve or reject but not submit or reverse", async () => {
    const user = userEvent.setup();
    const input = data();
    input.expenseSubmissions = [expenseSubmission("submitted")];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canReviewExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Record property expense" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record recoverable cost" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Review Sokha Repairs" }),
    );
    const details = screen.getByRole("dialog", { name: "Paid cost details" });
    await user.click(
      within(details).getByRole("button", { name: "Reject Sokha Repairs" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Reject paid cost" });
    const rejectButton = within(dialog).getByRole("button", {
      name: "Reject paid cost",
    });
    expect(rejectButton.hasAttribute("disabled")).toBe(true);
    await user.type(
      within(dialog).getByPlaceholderText("Required"),
      "Receipt does not match",
    );
    expect(rejectButton.hasAttribute("disabled")).toBe(false);
  });

  it("requires Finance to choose the paid-from source for maintenance cost approval", async () => {
    const user = userEvent.setup();
    const input = data();
    input.expenseSubmissions = [
      {
        ...expenseSubmission("submitted"),
        evidence: {
          documentId: "document-1",
          fileName: "receipt.pdf",
          href: "https://example.test/signed-receipt",
          mimeType: "application/pdf",
          sha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          sizeBytes: 128,
        },
        fundingSourceLabel: "Choose at approval",
        maintenanceTask: {
          completedAt: "2026-08-08T07:30:00Z",
          description: "Replace the failed pump and verify pressure.",
          href: "/maintenance?archiveState=all&taskId=task-1",
          status: "completed",
          title: "Garden Court pump replacement",
        },
        sourceId: "task-1",
        sourceType: "maintenance_task",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canReviewExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(screen.queryByText("Maintenance source")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Review Sokha Repairs" }),
    );
    const details = screen.getByRole("dialog", { name: "Paid cost details" });
    expect(within(details).getByText("Maintenance source")).not.toBeNull();
    await user.click(
      within(details).getByRole("button", { name: "Approve Sokha Repairs" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Approve paid cost" });
    expect(
      within(dialog).getByRole("link", { name: "receipt.pdf" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByText(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).not.toBeNull();
    expect(within(dialog).getByText("128 bytes")).not.toBeNull();
    expect(within(dialog).getByText("Receipt 42")).not.toBeNull();
    expect(
      within(dialog).getByRole("link", {
        name: "Garden Court pump replacement",
      }),
    ).not.toBeNull();
    expect(
      within(dialog).getByText("Replace the failed pump and verify pressure."),
    ).not.toBeNull();
    expect(within(dialog).getByText("Completed")).not.toBeNull();
    expect(
      within(dialog).getByRole("combobox", { name: "Paid from" }),
    ).not.toBeNull();
    expect(
      within(dialog)
        .getByRole("button", { name: "Approve paid cost" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows paid-cost reversal only to Super Admin", async () => {
    const user = userEvent.setup();
    const input = data();
    input.expenseSubmissions = [expenseSubmission("approved")];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({
          canReviewExpense: true,
          canReverseExpense: true,
          canSubmitExpense: true,
        })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Approved (1)" }));
    expect(
      screen.getByRole("button", { name: "View Sokha Repairs" }),
    ).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: "View Sokha Repairs" }),
    );
    const details = screen.getByRole("dialog", { name: "Paid cost details" });
    await user.click(
      within(details).getByRole("button", { name: "Reverse Sokha Repairs" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Reverse paid cost" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reverse paid cost" }),
    ).not.toBeNull();
  });

  it("keeps invoice selection inside the record payment modal", () => {
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    const headerActions = document.querySelector<HTMLElement>(
      '[data-slot="page-header-actions"]',
    );
    expect(headerActions).not.toBeNull();
    fireEvent.click(
      within(headerActions!).getByRole("button", {
        name: "Record tenant payment",
      }),
    );
    const chooser = screen.getByRole("dialog", {
      name: "Record tenant payment",
    });
    fireEvent.click(
      within(chooser).getByText("Sokha Trading Co.").closest("button")!,
    );

    expect(
      screen.getByRole("dialog", { name: "Record tenant payment" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose another" }),
    ).not.toBeNull();
  });

  it("shows direct-owner collection without pretending IPS received cash", () => {
    const input = data();
    input.leases[0].billing = {
      ...billing(),
      billingRecipientKind: "company",
      billingRecipientPersonId: "person-company",
      collectionRoute: "direct_to_owner",
      managementFeeMode: "flat",
      managementFeeValue: 65,
    };
    input.tenantInvoices = [tenantInvoice()];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.getByText("Sokha Trading Co.")).not.toBeNull();
    expect(screen.queryByText("Dara Tenant")).toBeNull();
    expect(screen.getByText("Owner")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    expect(screen.getByText("Dara Tenant")).not.toBeNull();
    expect(
      within(screen.getByRole("dialog", { name: "Invoice details" })).getByRole(
        "button",
        { name: "Confirm collected" },
      ),
    ).not.toBeNull();
  });

  it("keeps invoice PDF publication compact, capability-gated, and focus-safe", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    input.tenantInvoices = [invoice];

    const member = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    expect(
      screen.queryByRole("button", { name: "Publish PDF" }),
    ).toBeNull();
    member.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    const trigger = within(
      screen.getByRole("dialog", { name: "Invoice details" }),
    ).getByRole("button", { name: "Publish PDF" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const drawer = screen.getByRole("dialog", { name: "Publish invoice PDF" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(drawer).getByLabelText("Payment instructions"),
      ),
    );
    await user.tab();
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(
      within(drawer)
        .getAllByRole("textbox")
        .map((field) => field.getAttribute("name")),
    ).toEqual(["paymentInstructions", "contactEmail", "contactPhone", "note"]);
    expect(
      within(drawer).getAllByRole("button").map((button) => button.textContent),
    ).toEqual(expect.arrayContaining(["Cancel", "Publish PDF"]));
    expect(within(drawer).queryByText(/this will|use this|choose/i)).toBeNull();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Publish invoice PDF" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    trigger.focus();
    await user.keyboard("{Enter}");
    await user.click(
      within(screen.getByRole("dialog", { name: "Publish invoice PDF" })).getByRole(
        "button",
        { name: "Cancel" },
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Publish invoice PDF" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    financeActionMocks.publishTenantInvoicePdfAction.mockResolvedValueOnce({
      artifactHref: "/api/finance/documents/invoice-artifact",
      message: "Invoice published.",
      publicationStatus: "published",
      status: "success",
    });
    await user.click(trigger);
    const publicationDrawer = screen.getByRole("dialog", {
      name: "Publish invoice PDF",
    });
    await user.type(
      within(publicationDrawer).getByLabelText("Payment instructions"),
      "Bank transfer to IPS operating account.",
    );
    await user.type(
      within(publicationDrawer).getByLabelText("Email"),
      "billing@ips.example",
    );
    await user.type(
      within(publicationDrawer).getByLabelText("Phone"),
      "+855 12 345 678",
    );
    await user.click(
      within(publicationDrawer).getByRole("button", { name: "Publish PDF" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Publish invoice PDF" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(
      financeActionMocks.publishTenantInvoicePdfAction,
    ).toHaveBeenCalledOnce();
    const downloads = screen.getAllByRole("link", { name: "Download PDF" });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toBe(trigger);
    expect(downloads[0]?.getAttribute("href")).toBe(
      "/api/finance/documents/invoice-artifact",
    );
    expect(screen.queryByRole("button", { name: "Publish PDF" })).toBeNull();
  });

  it("keeps publication failures in the drawer with a concise usable error", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    input.tenantInvoices = [invoice];
    financeActionMocks.publishTenantInvoicePdfAction.mockResolvedValueOnce({
      message: "Invoice PDF unavailable.",
      status: "error",
    });

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    await user.click(screen.getByRole("button", { name: "Publish PDF" }));
    const drawer = screen.getByRole("dialog", { name: "Publish invoice PDF" });
    await user.type(
      within(drawer).getByLabelText("Payment instructions"),
      "Bank transfer to IPS operating account.",
    );
    await user.type(
      within(drawer).getByLabelText("Email"),
      "billing@ips.example",
    );
    await user.type(
      within(drawer).getByLabelText("Phone"),
      "+855 12 345 678",
    );
    await user.click(
      within(drawer).getByRole("button", { name: "Publish PDF" }),
    );

    expect((await within(drawer).findByRole("alert")).textContent).toContain(
      "Invoice PDF unavailable.",
    );
    expect(
      (within(drawer).getByLabelText("Note") as HTMLTextAreaElement).disabled,
    ).toBe(false);
  });

  it("keeps a published invoice PDF download-only for a Finance Member", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.pdf = {
      artifactId: "invoice-artifact",
      href: "/api/finance/documents/invoice-artifact",
      publicationStatus: "published",
      publishedAt: "2026-08-08T10:00:00Z",
    };
    invoice.publicationSnapshot = {
      contactEmail: "billing@ips.example",
      contactPhone: "+855 12 345 678",
      note: "Include the invoice number with payment.",
      paymentInstructions: "Bank transfer to IPS operating account.",
    };
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    const drawer = screen.getByRole("dialog", { name: "Invoice details" });
    expect(
      within(drawer).getByRole("link", { name: "Download PDF" }).getAttribute(
        "href",
      ),
    ).toBe("/api/finance/documents/invoice-artifact");
    expect(within(drawer).queryByRole("button", { name: "Publish PDF" })).toBeNull();
    expect(within(drawer).queryByLabelText("Payment instructions")).toBeNull();
    expect(within(drawer).getByText("Published 08 Aug 2026")).not.toBeNull();
    expect(
      within(drawer).getByText("Bank transfer to IPS operating account."),
    ).not.toBeNull();
    expect(within(drawer).getByText("billing@ips.example")).not.toBeNull();
  });

  it("does not offer invoice publication for a voided invoice without an artifact", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.paymentStatus = "voided";
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    expect(screen.queryByRole("button", { name: "Publish PDF" })).toBeNull();
  });

  it("shows immutable receipt history and keeps retry limited to payment operators", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.balanceDue = 0;
    invoice.paidThroughIps = 640;
    invoice.paymentStatus = "paid";
    invoice.settlements = [
      {
        amount: 640,
        date: "2026-08-08",
        id: "payment-1",
        isReversed: true,
        receipt: {
          artifactId: "receipt-artifact",
          href: "/api/finance/documents/receipt-artifact",
          publicationStatus: "published",
          publishedAt: "2026-08-08T10:00:00Z",
        },
        receiptNumber: "RCT-2026-0042",
        reference: "Bank transfer",
        reversalReason: "Duplicate payment",
        route: "through_ips",
      },
    ];
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    const details = screen.getByRole("dialog", { name: "Invoice details" });
    expect(within(details).getByText("Reversed")).not.toBeNull();
    const receiptDownload = within(details).getByRole("link", {
      name: "Download receipt",
    });
    expect(receiptDownload.getAttribute("href")).toBe(
      "/api/finance/documents/receipt-artifact",
    );
    expect(receiptDownload.getAttribute("data-next-link")).toBeNull();

    const failedInvoice = tenantInvoice();
    failedInvoice.collectionRoute = "through_ips";
    failedInvoice.balanceDue = 0;
    failedInvoice.paidThroughIps = 640;
    failedInvoice.paymentStatus = "paid";
    failedInvoice.settlements = [
      {
        amount: 640,
        date: "2026-08-08",
        id: "payment-failed",
        isReversed: false,
        receipt: {
          artifactId: "failed-artifact",
          href: null,
          publicationStatus: "failed",
          publishedAt: null,
        },
        receiptNumber: null,
        reference: null,
        reversalReason: null,
        route: "through_ips",
      },
    ];
    input.tenantInvoices = [failedInvoice];
    cleanup();
    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    expect(screen.getByText("Receipt unavailable")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retry receipt" })).toBeNull();
    cleanup();
    financeActionMocks.retryTenantReceiptPdfAction.mockResolvedValueOnce({
      artifactHref: "/api/finance/documents/retried-receipt",
      message: "Receipt published.",
      publicationStatus: "published",
      status: "success",
    });
    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    await user.click(screen.getByRole("button", { name: "Retry receipt" }));
    await waitFor(() =>
      expect(financeActionMocks.retryTenantReceiptPdfAction).toHaveBeenCalledOnce(),
    );
    const retryFormData = financeActionMocks.retryTenantReceiptPdfAction.mock
      .calls[0]?.[1] as FormData;
    expect(retryFormData.get("paymentId")).toBe("payment-failed");
    expect(
      screen.getByRole("link", { name: "Download receipt" }).getAttribute("href"),
    ).toBe("/api/finance/documents/retried-receipt");
  });

  it("allows an operator to retry a committed IPS payment without a persisted failure artifact", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.balanceDue = 0;
    invoice.paidThroughIps = 640;
    invoice.paymentStatus = "paid";
    invoice.settlements = [
      {
        amount: 640,
        date: "2026-08-08",
        id: "payment-without-failure-artifact",
        isReversed: false,
        receipt: {
          artifactId: null,
          href: null,
          publicationStatus: "not_published",
          publishedAt: null,
        },
        receiptNumber: null,
        reference: "Bank transfer",
        reversalReason: null,
        route: "through_ips",
      },
    ];
    input.tenantInvoices = [invoice];
    financeActionMocks.retryTenantReceiptPdfAction.mockResolvedValueOnce({
      artifactHref: "/api/finance/documents/recovered-receipt",
      message: "Receipt published.",
      publicationStatus: "published",
      status: "success",
    });

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    await user.click(screen.getByRole("button", { name: "Retry receipt" }));

    await waitFor(() =>
      expect(financeActionMocks.retryTenantReceiptPdfAction).toHaveBeenCalledOnce(),
    );
    const retryFormData = financeActionMocks.retryTenantReceiptPdfAction.mock
      .calls[0]?.[1] as FormData;
    expect(retryFormData.get("paymentId")).toBe(
      "payment-without-failure-artifact",
    );
    expect(
      screen.getByRole("link", { name: "Download receipt" }).getAttribute("href"),
    ).toBe("/api/finance/documents/recovered-receipt");
  });

  it("keeps failed receipt retry announced and usable with its exact payment", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.balanceDue = 0;
    invoice.paidThroughIps = 640;
    invoice.paymentStatus = "paid";
    invoice.settlements = [
      {
        amount: 640,
        date: "2026-08-08",
        id: "payment-retry-failed",
        isReversed: false,
        receipt: {
          artifactId: "failed-artifact",
          href: null,
          publicationStatus: "failed",
          publishedAt: null,
        },
        receiptNumber: null,
        reference: null,
        reversalReason: null,
        route: "through_ips",
      },
    ];
    input.tenantInvoices = [invoice];
    financeActionMocks.retryTenantReceiptPdfAction.mockResolvedValueOnce({
      message: "Receipt PDF unavailable.",
      status: "error",
    });

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    const retry = screen.getByRole("button", { name: "Retry receipt" });
    await user.click(retry);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Receipt PDF unavailable.",
    );
    retry.focus();
    expect(document.activeElement).toBe(retry);
    const retryFormData = financeActionMocks.retryTenantReceiptPdfAction.mock
      .calls[0]?.[1] as FormData;
    expect(retryFormData.get("paymentId")).toBe("payment-retry-failed");
  });

  it("shows the receipt result immediately after an IPS payment and no receipt for owner collection", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    input.tenantInvoices = [invoice];
    financeActionMocks.recordTenantInvoicePaymentAction.mockResolvedValueOnce({
      artifactHref: "/api/finance/documents/new-receipt",
      message: "Payment recorded.",
      publicationStatus: "published",
      status: "success",
    });

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    const paymentDialog = screen.getByRole("dialog", { name: "Record payment" });
    await user.click(
      within(paymentDialog).getByRole("button", { name: "Record payment" }),
    );
    const immediateReceiptDownload = await screen.findByRole("link", {
      name: "Download receipt",
    });
    expect(immediateReceiptDownload.getAttribute("href")).toBe(
      "/api/finance/documents/new-receipt",
    );
    expect(immediateReceiptDownload.getAttribute("data-next-link")).toBeNull();

    cleanup();
    financeActionMocks.recordTenantInvoicePaymentAction.mockResolvedValueOnce({
      message: "Payment recorded. Receipt unavailable.",
      paymentId: "payment-immediate-failed",
      publicationStatus: "failed",
      status: "success",
    });
    financeActionMocks.retryTenantReceiptPdfAction.mockResolvedValueOnce({
      artifactHref: "/api/finance/documents/immediate-retried-receipt",
      message: "Receipt published.",
      publicationStatus: "published",
      status: "success",
    });
    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Record payment" })).getByRole(
        "button",
        { name: "Record payment" },
      ),
    );
    expect(await screen.findByText("Receipt unavailable")).not.toBeNull();
    const immediateRetry = screen.getByRole("button", { name: "Retry receipt" });
    await user.click(immediateRetry);
    const immediateRetryFormData = financeActionMocks.retryTenantReceiptPdfAction.mock
      .calls[0]?.[1] as FormData;
    expect(immediateRetryFormData.get("paymentId")).toBe("payment-immediate-failed");
    expect(
      (await screen.findByRole("link", { name: "Download receipt" })).getAttribute(
        "href",
      ),
    ).toBe("/api/finance/documents/immediate-retried-receipt");
    expect(screen.queryByText("Receipt unavailable")).toBeNull();
    expect((await screen.findByRole("status")).textContent).toContain(
      "Receipt published.",
    );

    const ownerInvoice = tenantInvoice();
    ownerInvoice.collectionRoute = "direct_to_owner";
    ownerInvoice.balanceDue = 0;
    ownerInvoice.collectedByOwner = 640;
    ownerInvoice.paymentStatus = "paid";
    ownerInvoice.settlements = [
      {
        amount: 640,
        date: "2026-08-08",
        id: "owner-confirmation",
        isReversed: false,
        receipt: null,
        receiptNumber: null,
        reference: "Owner transfer",
        reversalReason: null,
        route: "direct_to_owner",
      },
    ];
    cleanup();
    input.tenantInvoices = [ownerInvoice];
    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    expect(screen.queryByRole("link", { name: "Download receipt" })).toBeNull();
    expect(screen.queryByText("Receipt unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry receipt" })).toBeNull();
  });

  it("keeps append-only settlement correction separate from ordinary payment authority", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.balanceDue = 0;
    invoice.collectedByOwner = 640;
    invoice.paymentStatus = "paid";
    invoice.settlements = [
      {
        amount: 640,
        date: "2026-08-08",
        id: "confirmation-1",
        isReversed: false,
        reference: "Owner transfer",
        receipt: null,
        receiptNumber: null,
        reversalReason: null,
        route: "direct_to_owner",
      },
    ];
    input.tenantInvoices = [invoice];

    const readOnly = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Correct settlement" }),
    ).toBeNull();
    readOnly.unmount();

    const paymentOnly = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Correct settlement" }),
    ).toBeNull();
    paymentOnly.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canCorrectFinance: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Invoice details" })).getByRole(
        "button",
        { name: "Correct settlement" },
      ),
    );

    const dialog = screen.getByRole("dialog", { name: "Correct settlement" });
    expect(
      within(dialog).getByRole("combobox", { name: "Settlement" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByText(/original stays in history/i),
    ).not.toBeNull();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Reverse settlement",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("summarizes owner balances in four columns and opens the full position on demand", async () => {
    const user = userEvent.setup();
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
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="balances"
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Property / owner", "Cash collected", "Available", "Action"]);
    expect(
      screen
        .getByRole("link", { name: "HOME — Riverside Home" })
        .getAttribute("href"),
    ).toBe("/properties/property-1/account");
    expect(
      screen.queryByRole("button", { name: "Owner invoice payment" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record owner distribution" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "View balance for Sokha Owner" }),
    );
    const readOnlyDialog = screen.getByRole("dialog", {
      name: "Owner balance details",
    });
    expect(within(readOnlyDialog).getByText("Owner balance")).not.toBeNull();
    expect(
      within(readOnlyDialog).getByText("Owner reimbursement due"),
    ).not.toBeNull();
    expect(
      within(readOnlyDialog).getByRole("link", {
        name: "Open property account",
      }),
    ).not.toBeNull();
    await user.click(
      within(readOnlyDialog).getByRole("button", { name: "Close" }),
    );
    await user.click(screen.getByRole("tab", { name: "Tenants & companies" }));
    expect(screen.getByText("Partly paid")).not.toBeNull();

    cleanup();
    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordOwnerCash: true })}
        organizationName="Sokha Property Services"
        view="balances"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View balance for Sokha Owner" }),
    );
    const balanceDialog = screen.getByRole("dialog", {
      name: "Owner balance details",
    });
    await user.click(
      within(balanceDialog).getByRole("button", {
        name: "Record owner distribution",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Record owner distribution",
    });
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')
        ?.value,
    ).toBe("person-owner");
  });

  it("opens the paid-cost drawer from the workspace create intent", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canSubmitExpense: true })}
        initialExpenseIntent="owner"
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Record property expense" }),
    ).not.toBeNull();
  });

  it("separates finance records from the page with a raised operating surface", () => {
    const { container } = render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="balances"
      />,
    );

    const tableFrame = container.querySelector<HTMLElement>(
      '[data-slot="finance-table-frame"]',
    );

    expect(tableFrame).not.toBeNull();
    expect(tableFrame?.className).toContain("rounded-xl");
    expect(tableFrame?.className).toContain("border");
    expect(tableFrame?.className).toContain("bg-card");
    expect(tableFrame?.className).toContain("shadow-sm");
    expect(within(tableFrame!).getByRole("table")).not.toBeNull();
    expect(
      within(tableFrame!).getByRole("row", { name: /Riverside Home/ })
        .className,
    ).toContain("border-b");
  });

  it("lets the finance table scroll horizontally without an inner clipping layer", () => {
    const { container } = render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="balances"
      />,
    );

    const tableFrame = container.querySelector<HTMLElement>(
      '[data-slot="finance-table-frame"]',
    );

    expect(tableFrame).not.toBeNull();
    const table = within(tableFrame!).getByRole("table");
    expect(tableFrame?.className).toContain("overflow-x-auto");
    expect(tableFrame?.className).not.toContain("overflow-auto");
    expect(tableFrame?.className).not.toContain("overflow-hidden");
    expect(tableFrame?.getAttribute("aria-label")).toBe("Finance records");
    expect(table.parentElement?.getAttribute("data-slot")).toBe(
      "table-container",
    );
    expect(table.parentElement?.parentElement).toBe(tableFrame);
  });

  it("names the property account activity scroll region for keyboard users", () => {
    const input = data();
    input.accountEntries = [
      {
        amount: 780,
        category: "rent_income",
        createdAt: "2026-08-05T08:00:00Z",
        date: "2026-08-05",
        id: "entry-1",
        label: "Rent income",
        note: "August rent",
        propertyId: "property-1",
        runningBalance: 780,
        sourceType: "tenant_invoice_payment",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        selectedPropertyId="property-1"
        view="account"
      />,
    );

    expect(
      screen.getByRole("region", { name: "Property account activity" }),
    ).not.toBeNull();
  });

  it("keeps the rent decision columns visible and removes repeated row metadata", () => {
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.occupantLabels = [invoice.recipientLabel];
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "Invoice",
      "Tenant / property",
      "Collected by",
      "Balance",
      "Status",
      "Preview",
    ]);
    expect(screen.queryByText("Occupants: Sokha Trading Co.")).toBeNull();
    expect(screen.queryByText("Generated automatically")).toBeNull();
    expect(screen.getByLabelText("Sokha Property Services").textContent).toBe(
      "Sokha",
    );
  });

  it("keeps one invoice entry point per rent row", () => {
    const input = data();
    input.tenantInvoices = [tenantInvoice()];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    const row = screen.getByRole("row", { name: /INV-202608-001/ });
    expect(within(row).getAllByRole("button")).toHaveLength(1);
    expect(
      within(row).getByRole("button", { name: "View invoice INV-202608-001" }),
    ).not.toBeNull();
  });

  it("uses one flat summary strip instead of card containers in finance registers", () => {
    const input = data();
    input.tenantInvoices = [tenantInvoice()];

    const { container } = render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(
      screen.getByRole("region", { name: "Finance summary" }),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  it("orders same-day account entries by their balance calculation sequence", () => {
    const input = data();
    input.accountEntries = [
      {
        amount: 100,
        category: "rent_income",
        createdAt: "2026-08-13T09:00:00Z",
        date: "2026-08-13",
        id: "rent-1",
        label: "Rent received first",
        note: "Collected by IPS",
        propertyId: "property-1",
        runningBalance: 100,
        sourceType: "tenant_invoice_payment",
      },
      {
        amount: 50,
        category: "owner_expense",
        createdAt: "2026-08-13T10:00:00Z",
        date: "2026-08-13",
        id: "expense-1",
        label: "Cleaning recorded later",
        note: "Vendor",
        propertyId: "property-1",
        runningBalance: 50,
        sourceType: "ips_expense_responsibility",
      },
    ] as FinanceOperationsData["accountEntries"];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        selectedPropertyId="property-1"
        view="account"
      />,
    );

    const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    expect(
      rows.findIndex((row) => row.includes("Cleaning recorded later")),
    ).toBeLessThan(
      rows.findIndex((row) => row.includes("Rent received first")),
    );
  });

  it("separates account money in from money out with semantic color", () => {
    const input = data();
    input.accountEntries = [
      {
        amount: 825,
        category: "rent_income",
        createdAt: "2026-08-13T09:00:00Z",
        date: "2026-08-13",
        id: "rent-1",
        label: "Rent",
        note: "Collected by IPS",
        propertyId: "property-1",
        runningBalance: 1000,
        sourceType: "tenant_invoice_payment",
      },
      {
        amount: 125,
        category: "owner_expense",
        createdAt: "2026-08-12T09:00:00Z",
        date: "2026-08-12",
        id: "expense-1",
        label: "Repairs and maintenance",
        note: "Khmer Home Services",
        propertyId: "property-1",
        runningBalance: 175,
        sourceType: "ips_expense_responsibility",
      },
    ];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        selectedPropertyId="property-1"
        view="account"
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Money in" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Money out" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Balance after" }),
    ).not.toBeNull();

    const rentRow = screen.getByRole("row", {
      name: /Rent Collected by IPS/,
    });
    const rentCells = within(rentRow).getAllByRole("cell");
    expect(rentCells[2].textContent).toContain("USD 825.00");
    expect(rentCells[2].querySelector(".text-success")).not.toBeNull();
    expect(rentCells[3].textContent).toContain("—");

    const expenseRow = screen.getByRole("row", {
      name: /Repairs and maintenance Khmer Home Services/,
    });
    const expenseCells = within(expenseRow).getAllByRole("cell");
    expect(expenseCells[2].textContent).toContain("—");
    expect(expenseCells[3].textContent).toContain("USD 125.00");
    expect(expenseCells[3].querySelector(".text-destructive")).not.toBeNull();
    expect(expenseCells[3].textContent).not.toContain("-");
  });

  it("distinguishes the owner balance from cash available to distribute", async () => {
    const user = userEvent.setup();
    const input = data();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordOwnerCash: true })}
        organizationName="Sokha Property Services"
        selectedPropertyId="property-1"
        view="account"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Owner account" }),
    ).not.toBeNull();
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(breadcrumb)
        .getByRole("link", { name: "Properties" })
        .getAttribute("href"),
    ).toBe("/properties");
    expect(
      within(breadcrumb)
        .getByRole("link", { name: "HOME — Riverside Home" })
        .getAttribute("href"),
    ).toBe("/properties/property-1");
    expect(within(breadcrumb).getByText("Owner account")).not.toBeNull();

    const summary = screen.getByRole("region", { name: "Account position" });
    expect(summary.className).toContain("pt-5");
    expect(summary.className).toContain("rounded-xl");
    expect(summary.className).toContain("bg-card");
    expect(summary.className).toContain("shadow-sm");
    expect(within(summary).getByText("Owner balance")).not.toBeNull();
    expect(
      within(summary).getByText("Income minus owner costs and distributions"),
    ).not.toBeNull();
    expect(within(summary).getByText("Cash available")).not.toBeNull();
    expect(
      within(summary).getByText("Cash held here and ready to distribute"),
    ).not.toBeNull();
    expect(within(summary).queryByText("Running balance")).toBeNull();
    expect(within(summary).queryByText("Owner funds held")).toBeNull();
    expect(within(summary).queryByText("Owner amount due")).toBeNull();

    const action = within(summary).getByRole("button", {
      name: "Record owner distribution",
    });
    await user.click(action);
    const dialog = screen.getByRole("dialog", {
      name: "Record owner distribution",
    });
    expect(
      within(dialog).queryByRole("navigation", { name: "Setup progress" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).not.toBeNull();
  });

  it("surfaces a nonzero owner amount due as an account warning", () => {
    const input = data();
    input.positions[0].ownerOwesIps = 125;

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        selectedPropertyId="property-1"
        view="account"
      />,
    );

    const warning = screen.getByRole("status", { name: "Owner amount due" });
    expect(within(warning).getByText("Owner amount due")).not.toBeNull();
    expect(within(warning).getByText("USD 125.00")).not.toBeNull();
  });
});

function data(): FinanceOperationsData {
  return {
    accountEntries: [],
    expenseSubmissions: [],
    financeCategories: [
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
        code: "utilities",
        displayLabel: "Utilities",
        id: "category-owner-utilities",
        isActive: true,
        isDefault: true,
        namespace: "owner_expense",
        reportingGroup: "utilities",
        sortOrder: 20,
      },
      {
        archivedAt: null,
        code: "repairs_maintenance",
        displayLabel: "Repairs and maintenance",
        id: "category-owner-repairs",
        isActive: true,
        isDefault: true,
        namespace: "owner_expense",
        reportingGroup: "maintenance",
        sortOrder: 30,
      },
      {
        archivedAt: null,
        code: "other",
        displayLabel: "Other",
        id: "category-owner-other",
        isActive: true,
        isDefault: true,
        namespace: "owner_expense",
        reportingGroup: "other",
        sortOrder: 40,
      },
      {
        archivedAt: null,
        code: "cleaning",
        displayLabel: "Cleaning",
        id: "category-tenant-cleaning",
        isActive: true,
        isDefault: true,
        namespace: "tenant_billing",
        reportingGroup: "other",
        sortOrder: 10,
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
        sortOrder: 20,
      },
      {
        archivedAt: null,
        code: "repairs_maintenance",
        displayLabel: "Repairs and maintenance",
        id: "category-tenant-repairs",
        isActive: true,
        isDefault: true,
        namespace: "tenant_billing",
        reportingGroup: "other",
        sortOrder: 30,
      },
      {
        archivedAt: null,
        code: "other",
        displayLabel: "Other",
        id: "category-tenant-other",
        isActive: true,
        isDefault: true,
        namespace: "tenant_billing",
        reportingGroup: "other",
        sortOrder: 40,
      },
    ],
    leases: [
      {
        billing: null,
        endDate: "2027-07-31",
        expectedCurrentBillingRuleId: null,
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
      {
        id: "person-tenant",
        label: "Dara Tenant",
        partyType: "individual",
      },
      {
        id: "person-company",
        label: "Sokha Trading Co.",
        partyType: "company",
      },
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
    rentGenerationExceptions: [],
    tenantInvoices: [],
    unitOptions: [
      { id: "unit-1", label: "HOME — Unit 01", propertyId: "property-1" },
    ],
  };
}

function tenantInvoice(): FinanceOperationsData["tenantInvoices"][number] {
  return {
    balanceDue: 640,
    billingPeriodStart: "2026-08-01",
    collectedByOwner: 0,
    collectionRoute: "direct_to_owner",
    dueDate: "2026-08-05",
    id: "invoice-1",
    generationSource: "scheduled",
    invoiceNumber: "INV-202608-001",
    isProrated: false,
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
    pdf: {
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    },
    publicationSnapshot: null,
    propertyId: "property-1",
    propertyLabel: "HOME — Riverside Home",
    recipientLabel: "Sokha Trading Co.",
    settlements: [],
    totalAmount: 640,
    unitId: "unit-1",
    unitLabel: "HOME — Unit 01",
  };
}

function financeCapabilities(
  overrides: Partial<{
    canConfigureRent: boolean;
    canCorrectFinance: boolean;
    canRecordOwnerCash: boolean;
    canRecordPayments: boolean;
    canRecoverRent: boolean;
    canReviewExpense: boolean;
    canReverseExpense: boolean;
    canRetryCurrentRent: boolean;
    canSubmitExpense: boolean;
  }> = {},
) {
  return {
    canConfigureRent: false,
    canCorrectFinance: false,
    canRecordOwnerCash: false,
    canRecordPayments: false,
    canRecoverRent: false,
    canReviewExpense: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: false,
    ...overrides,
  };
}

function billing(): NonNullable<
  FinanceOperationsData["leases"][number]["billing"]
> {
  return {
    billingRecipientKind: "individual",
    billingRecipientPersonId: "person-tenant",
    chargeManagementFeeWhenActive: true,
    chargeThroughLeaseEnd: true,
    collectionRoute: "through_ips",
    effectiveFrom: "2026-08-01",
    effectiveTo: "2027-07-31",
    finalPeriodProratedAmount: null,
    firstPeriodProratedAmount: null,
    fullManagementFeeDuringProration: true,
    id: "billing-1",
    leaseEndProrationRule: "actual_days",
    leaseStartProrationRule: "actual_days",
    managementFeeMode: "percentage",
    managementFeeValue: 10,
    midPeriodRentChangeRule: "next_full_month",
    rentCalculationTimezone: "Asia/Bangkok",
    shortMonthDueDayRule: "last_calendar_day",
  };
}

function expenseSubmission(
  status: FinanceOperationsData["expenseSubmissions"][number]["status"],
): FinanceOperationsData["expenseSubmissions"][number] {
  return {
    category: "repairs_maintenance",
    customerTotal: 220,
    date: "2026-08-08",
    fundingSourceLabel: "BANK - Operating",
    id: "expense-submission-1",
    internalCost: 200,
    internalMarkup: 20,
    propertyId: "property-1",
    propertyLabel: "HOME - Riverside Home",
    reference: "Receipt 42",
    responsibility: "owner",
    reviewedAt: null,
    reviewReason: null,
    reversalReason: null,
    sourceId: null,
    sourceType: "general",
    status,
    submittedAt: "2026-08-08T08:00:00Z",
    submittedByLabel: "finance.member@nestory.com",
    submittedByUserId: "finance-member-user-1",
    unitId: "unit-1",
    unitLabel: "HOME - Unit 01",
    vendorLabel: "Sokha Repairs",
  };
}
