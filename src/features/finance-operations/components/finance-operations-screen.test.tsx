// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FinanceOperationsScreen } from "./finance-operations-screen";
import type { FinanceOperationsData } from "../finance-operations.types";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  }
});

afterEach(cleanup);

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("FinanceOperationsScreen", () => {
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
      screen.getByRole("button", { name: "Retry rent for Sep 2026" }),
    ).not.toBeNull();
  });

  it("labels invoice provenance as operational lease context", () => {
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

    expect(screen.getByText("Generated automatically")).not.toBeNull();
    expect(screen.getByText("Aug 2026 lease month")).not.toBeNull();
    expect(screen.getByText("Prorated")).not.toBeNull();
    expect(screen.queryByText(/journal|month close|uuid/i)).toBeNull();
  });

  it("focuses rent-ready handoff on invoices for the exact lease", () => {
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
        {...financeCapabilities()}
        initialRentLeaseId="lease-1"
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.getByText("INV-FOCUSED")).not.toBeNull();
    expect(screen.queryByText("INV-UNRELATED")).toBeNull();
    expect(screen.getAllByText("1 invoice", { exact: true }).length).toBeGreaterThan(0);
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

  it("reserves selected-period rent recovery for Super Admin", () => {
    const readOnly = render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities()}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Recover missed month" }),
    ).toBeNull();
    readOnly.unmount();

    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canRecoverRent: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Recover missed month" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Recover missed rent" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Missed rent month" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Generate selected month" }),
    ).not.toBeNull();
    expect(screen.getByText(/never fills earlier or later months/i)).not.toBeNull();
    expect(
      screen.getByText(/adjacent gaps remain visible in the attention queue/i),
    ).not.toBeNull();
  });

  it("starts from a compact finance work queue and opens the four-step lease setup", () => {
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
    expect(screen.getAllByText("Choose who is billed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled"),
    ).toBe(true);

  });

  it("does not invent billing choices for a new lease setup", async () => {
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
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText("Choose who is billed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choose a recipient").length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText("Billing effective date").getAttribute("value"),
    ).toBe("");
    expect(
      screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled"),
    ).toBe(true);
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

  it("makes the already-paid cost workflow explicit and requires receipt evidence", () => {
    render(
      <FinanceOperationsScreen
        {...data()}
        {...financeCapabilities({ canSubmitExpense: true })}
        organizationName="Sokha Property Services"
        view="expenses"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record paid cost" }));
    expect(
      screen.getByRole("dialog", { name: "Record paid cost" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close drawer" })).not.toBeNull();
    expect(screen.getByText("Already paid")).not.toBeNull();
    expect(
      screen.getByText(/submitting does not record a new payment/i),
    ).not.toBeNull();
    expect(screen.getByText("Charge this to")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Property owner" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Tenant or company" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByLabelText("Paid-cost category")).not.toBeNull();
    expect(screen.getByLabelText("Amount paid")).not.toBeNull();
    expect(screen.getByLabelText("Paid date")).not.toBeNull();
    expect(screen.getByLabelText("Paid from")).not.toBeNull();
    expect(screen.getByLabelText("Receipt or payment reference")).toHaveProperty(
      "required",
      true,
    );
    const evidence = screen.getByLabelText("Receipt evidence");
    expect(evidence).toHaveProperty("required", true);
    expect(evidence.getAttribute("accept")).toBe(
      "application/pdf,image/jpeg,image/png,image/webp",
    );
    expect(screen.queryByText("Internal breakdown")).toBeNull();
    expect(screen.queryByText("Service fee")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tenant or company" }));
    expect(screen.getByText("Service fee")).not.toBeNull();
    expect(screen.getByText("Invoice line")).not.toBeNull();
    expect(screen.getByText("No open invoice")).not.toBeNull();
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
      screen.getByRole("button", { name: "Record paid cost" }),
    ).not.toBeNull();
    expect(screen.getByText("Awaiting approval")).not.toBeNull();
    expect(screen.getByText("Read only")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /approve sokha repairs/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject sokha repairs/i })).toBeNull();
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
      screen.queryByRole("button", { name: "Record paid cost" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Approve Sokha Repairs" }),
    ).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Reject Sokha Repairs" }),
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

    expect(screen.getByText("Maintenance cost")).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Approve Sokha Repairs" }),
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
      within(dialog).getByRole("link", { name: "Garden Court pump replacement" }),
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
      screen.getByRole("button", { name: "Reverse Sokha Repairs" }),
    ).not.toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Reverse Sokha Repairs" }),
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
      within(headerActions!).getByRole("button", { name: "Record payment" }),
    );
    const chooser = screen.getByRole("dialog", { name: "Record payment" });
    fireEvent.click(
      within(chooser).getByText("Sokha Trading Co.").closest("button")!,
    );

    expect(
      screen.getByRole("dialog", { name: "Record payment" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose another" }),
    ).not.toBeNull();
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
        {...financeCapabilities({ canRecordPayments: true })}
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
    expect(screen.queryByRole("button", { name: "Correct" })).toBeNull();
    readOnly.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    expect(screen.queryByRole("button", { name: "Correct" })).toBeNull();
    readOnly.unmount();

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canCorrectFinance: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Correct" }));

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

  it("keeps owner cash, owner debt, and withdrawal availability separate", async () => {
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
    expect(screen.queryByRole("button", { name: "Owner invoice payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Owner distribution" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
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
    await user.click(screen.getByRole("button", { name: "Owner distribution" }));
    const dialog = screen.getByRole("dialog", { name: "Owner distribution" });
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')?.value,
    ).toBe("person-owner");
  });

  it("keeps the dominant finance table unframed while retaining row separators", () => {
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
    expect(tableFrame?.className).not.toMatch(
      /(?:^|\s)(?:rounded-md|rounded-lg|border)(?:\s|$)/,
    );
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
    expect(tableFrame?.className).toContain("overflow-auto");
    expect(tableFrame?.className).not.toContain("overflow-hidden");
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
        date: "2026-08-05",
        id: "entry-1",
        label: "Rent income",
        note: "August rent",
        propertyId: "property-1",
        runningBalance: 780,
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
});

function data(): FinanceOperationsData {
  return {
    accountEntries: [],
    expenseSubmissions: [],
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

function billing(): NonNullable<FinanceOperationsData["leases"][number]["billing"]> {
  return {
    billingRecipientKind: "individual",
    billingRecipientPersonId: "person-tenant",
    chargeManagementFeeWhenActive: true,
    collectionRoute: "through_ips",
    effectiveFrom: "2026-08-01",
    finalPeriodProratedAmount: null,
    firstPeriodProratedAmount: null,
    fullManagementFeeDuringProration: true,
    id: "billing-1",
    managementFeeMode: "percentage",
    managementFeeValue: 10,
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
    reviewReason: null,
    reversalReason: null,
    sourceId: null,
    sourceType: "general",
    status,
    submittedAt: "2026-08-08T08:00:00Z",
    unitId: "unit-1",
    unitLabel: "HOME - Unit 01",
    vendorLabel: "Sokha Repairs",
  };
}
