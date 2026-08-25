/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaseDetailScreen } from "@/features/leases/components/lease-detail-screen";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";
import type { LeasePaymentResolutionData } from "@/features/finance-operations/finance-operations.types";
import type { LeaseRecordSection } from "@/features/leases/lease-detail-route";

const actionMocks = vi.hoisted(() => ({
  confirmOwnerCollectionAction: vi.fn(),
  recordTenantInvoicePaymentAction: vi.fn(),
  retryTenantReceiptPdfAction: vi.fn(),
}));
const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/dates/format", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dates/format")>();

  return {
    ...actual,
    formatDate: (value: string | Date) => {
      if (value === "2026-08-01" || value === "2026-08-31") {
        return new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          timeZone: "America/Los_Angeles",
          year: "numeric",
        }).format(new Date(value));
      }

      return actual.formatDate(value);
    },
  };
});

vi.mock("@/features/leases/actions", () => ({
  archiveLeaseAction: async () => ({}),
  cancelLeaseActivationAction: async () => ({}),
  createLeaseAction: async () => ({}),
  recordCurrentLeaseOccupancyEvidenceAction: async () => ({}),
  recordLeaseDepositEventAction: async () => ({}),
  restoreLeaseAction: async () => ({}),
  reverseLeaseDepositEventAction: async () => ({}),
  scheduleLeaseActivationAction: async () => ({}),
  scheduleFutureRentTermAction: async () => ({}),
  saveLeaseBillingRulesAction: async () => ({}),
  transitionLeaseLifecycleAction: async () => ({}),
  updateLeaseAction: async () => ({}),
}));

vi.mock("@/features/finance-operations/actions", () => actionMocks);

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

beforeEach(() => {
  actionMocks.confirmOwnerCollectionAction.mockReset();
  actionMocks.recordTenantInvoicePaymentAction.mockReset();
  actionMocks.retryTenantReceiptPdfAction.mockReset();
  routerMocks.refresh.mockReset();
  routerMocks.replace.mockReset();
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("LeaseDetailScreen", () => {
  it("replaces the record sections with the focused payment resolution", () => {
    renderDetail("overview", makeLease(), allLeasePermissions, {
      paymentResolution: resolutionFixture(),
    });

    expect(
      screen.getByRole("heading", { name: "Resolve outstanding rent" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Lease record sections" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Alice Tenant — Unit 2A",
      }),
    ).not.toBeNull();
    expect(
      screen.getByText("Riverside House · 01 Jul 2026–30 Jun 2027"),
    ).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(1);
    const defaultButtons = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("data-variant") === "default");
    expect(defaultButtons).toHaveLength(1);
    expect(defaultButtons[0]).toBe(
      screen.getByRole("button", { name: "Record USD 258.00 payment" }),
    );
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("keeps one More trigger when focused on a draft Lease", () => {
    const lease = makeLease();
    lease.statusLabel = "Draft";
    lease.statusValue = "draft";

    renderDetail("overview", lease, allLeasePermissions, {
      paymentResolution: resolutionFixture(),
    });

    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Edit draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("keeps the ordinary four-section Lease record when focus is absent", () => {
    renderDetail("overview");

    const nav = screen.getByRole("navigation", {
      name: "Lease record sections",
    });
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toBeNull();
    expect(
      within(nav).getByRole("link", { name: "Rent & deposit" }),
    ).not.toBeNull();
    expect(
      within(nav).getByRole("link", { name: "Move-in & move-out" }),
    ).not.toBeNull();
    expect(
      within(nav).getByRole("link", { name: "Files & history" }),
    ).not.toBeNull();
  });

  it("shows a fallback route notice and its optional destination", () => {
    renderDetail("overview", makeLease(), allLeasePermissions, {
      routeNotice: {
        href: "/rent-income?leaseId=lease-1",
        linkLabel: "Open Finance",
        message: "Confirm owner collection in Finance.",
      },
    });

    expect(screen.getByRole("status").textContent).toContain(
      "Confirm owner collection in Finance.",
    );
    expect(
      screen.getByRole("link", { name: "Open Finance" }).getAttribute("href"),
    ).toBe("/rent-income?leaseId=lease-1");
    expect(
      screen.getByRole("navigation", { name: "Lease record sections" }),
    ).not.toBeNull();
  });

  it("shows a route notice introduced by a same-Lease rerender", () => {
    const view = renderDetail("overview");
    expect(screen.queryByRole("status")).toBeNull();

    view.rerender(
      detailElement("overview", makeLease(), allLeasePermissions, {
        routeNotice: {
          message: "This invoice is voided and cannot receive a payment.",
        },
      }),
    );

    expect(screen.getByRole("status").textContent).toContain(
      "This invoice is voided and cannot receive a payment.",
    );
  });

  it("removes a route notice when the same Lease returns to normal", () => {
    const view = renderDetail("overview", makeLease(), allLeasePermissions, {
      routeNotice: {
        message: "That invoice is no longer available for this Lease.",
      },
    });
    expect(screen.getByRole("status")).not.toBeNull();

    view.rerender(detailElement("overview"));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not retain a route notice above a later focused query", () => {
    const view = renderDetail("overview", makeLease(), allLeasePermissions, {
      routeNotice: {
        message: "That invoice is no longer available for this Lease.",
      },
    });

    view.rerender(
      detailElement("overview", makeLease(), allLeasePermissions, {
        paymentResolution: resolutionFixture(),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Resolve outstanding rent" }),
    ).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("carries published-receipt payment success into the returned summary once", async () => {
    actionMocks.recordTenantInvoicePaymentAction.mockResolvedValue({
      artifactHref: "/api/finance/documents/receipt-1",
      message: "Payment recorded.",
      paymentId: "payment-1",
      publicationStatus: "published",
      status: "success",
    });
    const view = renderDetail("overview", makeLease(), allLeasePermissions, {
      paymentResolution: resolutionFixture(),
    });
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith("/leases/lease-1");
    });

    view.rerender(detailElement("overview"));
    expect(screen.getByRole("status").textContent).toContain("Payment recorded.");
    expect(
      screen
        .getByRole("link", { name: "Download receipt" })
        .getAttribute("href"),
    ).toBe("/api/finance/documents/receipt-1");

    const nextResolution = resolutionFixture();
    nextResolution.invoice = {
      ...nextResolution.invoice,
      id: "invoice-2",
      invoiceNumber: "INV-202608-002",
    };

    view.rerender(
      detailElement("overview", makeLease(), allLeasePermissions, {
        paymentResolution: nextResolution,
      }),
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Resolve outstanding rent" }),
    ).not.toBeNull();

    view.rerender(detailElement("overview"));
    expect(screen.queryByRole("status")).toBeNull();

    view.rerender(
      detailElement("overview", makeLease(), allLeasePermissions, {
        routeNotice: {
          message: "This invoice is voided and cannot receive a payment.",
        },
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "This invoice is voided and cannot receive a payment.",
    );
    expect(screen.getByRole("status").textContent).not.toContain(
      "Payment recorded.",
    );
  });

  it("carries receipt-unavailable payment success into the returned summary once", async () => {
    actionMocks.recordTenantInvoicePaymentAction.mockResolvedValue({
      artifactHref: null,
      message: "Payment recorded. Receipt unavailable.",
      paymentId: "payment-1",
      publicationStatus: "failed",
      status: "success",
    });
    const view = renderDetail("overview", makeLease(), allLeasePermissions, {
      paymentResolution: resolutionFixture(),
    });

    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith("/leases/lease-1");
    });

    view.rerender(detailElement("overview"));
    expect(screen.getByRole("status").textContent).toContain(
      "Payment recorded. Receipt unavailable.",
    );
    expect(
      screen.getByRole("button", { name: "Retry receipt" }),
    ).not.toBeNull();
    expect(
      view.container.querySelector<HTMLInputElement>('input[name="paymentId"]')
        ?.value,
    ).toBe("payment-1");

    view.rerender(detailElement("rent"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps one useful More trigger in focused view without Lease mutation authority", async () => {
    const user = userEvent.setup();
    renderDetail(
      "overview",
      makeLease(),
      {
        canActivate: false,
        canArchive: false,
        canChangeTerms: false,
        canClose: false,
        canPrepare: false,
      },
      { paymentResolution: resolutionFixture() },
    );

    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(
      screen.getByRole("menuitem", { name: "Open full lease record" }),
    ).not.toBeNull();
  });

  it("replaces the focused URL after an authoritative payment succeeds", async () => {
    actionMocks.recordTenantInvoicePaymentAction.mockResolvedValue({
      artifactHref: "/api/finance/documents/receipt-1",
      message: "Payment recorded.",
      paymentId: "payment-1",
      publicationStatus: "published",
      status: "success",
    });
    const view = renderDetail("overview", makeLease(), allLeasePermissions, {
      paymentResolution: resolutionFixture(),
    });

    fireEvent.submit(view.container.querySelector("form")!);

    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith("/leases/lease-1");
    });
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("provides one ordered record with four sections", () => {
    renderDetail("overview");

    const nav = screen.getByRole("navigation", {
      name: "Lease record sections",
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Overview",
      "Rent & deposit",
      "Move-in & move-out",
      "Files & history",
    ]);
    expect(
      screen.getByRole("heading", { level: 1, name: "Alice Tenant" }),
    ).not.toBeNull();
    expect(
      screen.getAllByText(/Riverside House \/ Unit 2A/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Renew lease" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Manage lease" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Change rent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit lease" })).toBeNull();
  });

  it("keeps database lifecycle fields out of the active lease workflow", () => {
    renderDetail("overview");

    expect(screen.queryByRole("button", { name: "Edit lease" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Term status" })).toBeNull();
  });

  it("keeps task-specific management discoverable outside Overview without exposing active editing", async () => {
    const user = userEvent.setup();
    renderDetail("rent");

    expect(screen.queryByRole("button", { name: "Edit lease" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit draft" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage lease" }));
    expect(screen.getByRole("menuitem", { name: "Change rent" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Record notice" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Complete move-out" })).not.toBeNull();
  });

  it("offers Activate today or a scheduled date without asking for an explanation", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.statusLabel = "Draft";
    lease.statusValue = "draft";

    renderDetail("overview", lease);

    expect(screen.getByRole("button", { name: "Edit draft" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Activate lease" }));

    const dialog = screen.getByRole("dialog", { name: "Activate lease" });
    expect(within(dialog).queryByRole("navigation", { name: "Setup progress" })).toBeNull();
    const mode = within(dialog).getByRole("combobox", { name: "Activation timing" });
    expect(mode.textContent).toContain("Activate today");
    expect(within(dialog).queryByLabelText("Activation date")).toBeNull();
    expect(within(dialog).queryByLabelText("Reason or note")).toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="activationDate"]')?.value,
    ).toBeTruthy();

    await user.click(mode);
    await user.click(screen.getByRole("option", { name: "Activate on date" }));
    expect(within(dialog).getByLabelText("Activation date")).not.toBeNull();
  });

  it("cancels a draft through the checked lifecycle transition", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.statusLabel = "Draft";
    lease.statusValue = "draft";

    renderDetail("overview", lease);

    await user.click(screen.getByRole("button", { name: "Cancel draft" }));

    const dialog = screen.getByRole("dialog", { name: "Cancel draft" });
    expect(within(dialog).getByLabelText("Cancellation date")).not.toBeNull();
    expect(within(dialog).getByLabelText("Reason or note")).not.toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="transition"]')?.value,
    ).toBe("cancel");
  });

  it("shows a pending activation with a direct cancel action", () => {
    const lease = makeLease();
    lease.statusLabel = "Draft";
    lease.statusValue = "draft";
    lease.activationSchedule = {
      activationDate: "2026-09-01",
      failureMessage: null,
      id: "70000000-0000-0000-0000-000000000001",
      status: "pending",
    };

    renderDetail("overview", lease);

    expect(screen.getByText(/scheduled for/i).textContent).toContain("01 Sept 2026");
    expect(
      screen.getByRole("button", { name: "Cancel scheduled activation" }),
    ).not.toBeNull();
  });

  it("edits only draft terms without exposing relationship or lifecycle fields", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.statusLabel = "Draft";
    lease.statusValue = "draft";

    renderDetail("overview", lease);
    await user.click(screen.getByRole("button", { name: "Edit draft" }));

    const dialog = screen.getByRole("dialog", { name: "Edit draft" });
    expect(within(dialog).getByRole("form", { name: "Edit draft form" })).not.toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Tenant" })).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Property" })).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Unit" })).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Status" })).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Term status" })).toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="tenantPersonId"]')
        ?.value,
    ).toBe("person-1");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="propertyId"]')?.value,
    ).toBe("property-1");
    expect(dialog.querySelector<HTMLInputElement>('input[name="unitId"]')?.value).toBe(
      "unit-1",
    );
  });

  it("starts renewal from the day after the current term", async () => {
    const user = userEvent.setup();
    renderDetail("overview");

    await user.click(screen.getByRole("button", { name: "Renew lease" }));

    const dialog = screen.getByRole("dialog", { name: "Renew lease" });
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="startDate"]')?.value,
    ).toBe("2027-07-01");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="endDate"]')?.value,
    ).toBe("2028-06-30");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="supersedesTermId"]')
        ?.value,
    ).toBe("term-1");
  });

  it("completes move-out through the checked end transition", async () => {
    const user = userEvent.setup();
    renderDetail("overview");

    await user.click(screen.getByRole("button", { name: "Manage lease" }));
    await user.click(screen.getByRole("menuitem", { name: "Complete move-out" }));

    const dialog = screen.getByRole("dialog", { name: "Complete move-out" });
    expect(within(dialog).getByLabelText("Move-out date")).not.toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="transition"]')?.value,
    ).toBe("end");
  });

  it("uses the checked lifecycle workflow instead of editing status directly", async () => {
    const user = userEvent.setup();
    renderDetail("overview");

    await user.click(screen.getByRole("button", { name: "Manage lease" }));
    await user.click(screen.getByRole("menuitem", { name: "Record notice" }));

    const dialog = screen.getByRole("dialog", { name: "Record notice" });
    expect(within(dialog).getByLabelText("Notice date")).not.toBeNull();
    expect(
      within(dialog).getByLabelText("Planned move-out date"),
    ).not.toBeNull();
    expect(within(dialog).getByLabelText("Reason or note")).not.toBeNull();
    expect(
      within(dialog).queryByRole("combobox", { name: "Status" }),
    ).toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>(
        'input[name="expectedOccupancyId"]',
      )?.value,
    ).toBe("occupancy-1");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="transition"]')?.value,
    ).toBe("give_notice");
  });

  it.each([
    ["rent", "Rent & deposit", "Change rent"],
    ["occupancy", "Move-in & move-out", "Confirmed dates"],
    ["files", "Files & history", "Lease agreement.pdf"],
  ] as const)(
    "keeps %s workflows in the %s section",
    (section, heading, content) => {
      renderDetail(section);

      expect(screen.getByRole("heading", { name: heading })).not.toBeNull();
      expect(screen.getByText(content)).not.toBeNull();
    },
  );

  it("keeps deposit history and changes inside one drawer", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.terms.push({ ...lease.terms[0]!, id: "term-old", status: "superseded" });
    lease.deposits[0]!.events = [
      {
        amountDisplay: lease.deposits[0]!.amountDisplay,
        eventDate: "2026-07-01",
        eventType: "received",
        id: "deposit-event-1",
        reference: "RCPT-1",
        reversible: true,
      },
    ];

    renderDetail("rent", lease);

    expect(
      screen.getByRole("heading", { name: "Rent schedule" }),
    ).not.toBeNull();
    expect(screen.queryByText("Rent status")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Deposit activity" }),
    ).toBeNull();
    expect(
      screen.getByText("USD 1,200.00 required · USD 0.00 held"),
    ).not.toBeNull();
    expect(screen.queryByText("Replaced")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Rent history" }));
    expect(screen.getByText("Replaced")).not.toBeNull();
    expect(screen.queryByText(/Receipt or note/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage deposit" }));

    const drawer = screen.getByRole("dialog", {
      name: "Manage security deposit",
    });
    expect(within(drawer).getByText(/Receipt or note/)).not.toBeNull();
    expect(
      within(drawer).getByRole("button", { name: "Save deposit activity" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("button", { name: "Undo entry" }),
    ).not.toBeNull();
    expect(screen.queryByText(/received \/ /)).toBeNull();
  });

  it("hides only the receipt choice once the deposit obligation is fully received", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.deposits[0]!.events = [
      {
        amountDisplay: lease.deposits[0]!.amountDisplay,
        eventDate: "2026-07-01",
        eventType: "received",
        id: "deposit-event-1",
        reference: "Created with lease",
        reversible: true,
      },
    ];
    lease.deposits[0]!.heldBalance = 1200;
    lease.deposits[0]!.heldBalanceCents = 120000;
    lease.deposits[0]!.receivedAmount = 1200;

    renderDetail("rent", lease);
    await user.click(screen.getByRole("button", { name: "Manage deposit" }));
    const drawer = screen.getByRole("dialog", {
      name: "Manage security deposit",
    });
    expect(within(drawer).getByRole("button", { name: "Undo entry" })).not.toBeNull();
    await user.click(
      within(drawer).getByRole("combobox", { name: "Deposit activity" }),
    );

    expect(screen.queryByRole("option", { name: "Deposit received" })).toBeNull();
    expect(screen.getByRole("option", { name: "Deposit retained" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Deposit refunded" })).not.toBeNull();
  });

  it("retains the receipt choice for a partially received deposit", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.deposits[0]!.heldBalance = 400;
    lease.deposits[0]!.heldBalanceCents = 40000;
    lease.deposits[0]!.receivedAmount = 400;

    renderDetail("rent", lease);
    await user.click(screen.getByRole("button", { name: "Manage deposit" }));
    const drawer = screen.getByRole("dialog", {
      name: "Manage security deposit",
    });
    await user.click(
      within(drawer).getByRole("combobox", { name: "Deposit activity" }),
    );

    expect(screen.getByRole("option", { name: "Deposit received" })).not.toBeNull();
  });

  it("offers receipt again when a refund lowers the currently held balance", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.deposits[0]!.events = [
      {
        amountDisplay: lease.deposits[0]!.amountDisplay,
        eventDate: "2026-07-01",
        eventType: "received",
        id: "deposit-event-received",
        reference: "Full receipt",
        reversible: true,
      },
      {
        amountDisplay: { primary: "USD 200.00" },
        eventDate: "2026-07-02",
        eventType: "refunded",
        id: "deposit-event-refunded",
        reference: "Partial refund",
        reversible: true,
      },
    ];
    lease.deposits[0]!.heldBalance = 1000;
    lease.deposits[0]!.heldBalanceCents = 100000;
    lease.deposits[0]!.receivedAmount = 1200;

    renderDetail("rent", lease);
    await user.click(screen.getByRole("button", { name: "Manage deposit" }));
    const drawer = screen.getByRole("dialog", {
      name: "Manage security deposit",
    });
    await user.click(
      within(drawer).getByRole("combobox", { name: "Deposit activity" }),
    );

    expect(screen.getByRole("option", { name: "Deposit received" })).not.toBeNull();
  });

  it("does not expose an empty activity form for a zero deposit obligation", () => {
    const lease = makeLease();
    lease.deposits[0]!.amount = 0;
    lease.deposits[0]!.amountCents = 0;
    lease.deposits[0]!.heldBalance = 0;
    lease.deposits[0]!.heldBalanceCents = 0;
    lease.deposits[0]!.receivedAmount = 0;

    renderDetail("rent", lease);

    expect(screen.queryByRole("button", { name: "Record deposit activity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage held deposit" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Deposit activity" })).toBeNull();
  });

  it("shows current, scheduled, and historical billing rules directly below the rent schedule", () => {
    const lease = makeLease();
    Object.assign(lease, {
      billingRules: [
        billingRule({
          effectiveFrom: "2026-07-01",
          effectiveTo: "2026-08-31",
          id: "billing-history",
          state: "historical",
        }),
        billingRule({
          effectiveFrom: "2026-09-01",
          effectiveTo: "2027-05-31",
          id: "billing-current",
          state: "current",
        }),
        billingRule({
          effectiveFrom: "2027-06-01",
          effectiveTo: "2027-06-30",
          id: "billing-future",
          state: "scheduled",
        }),
      ],
    });

    renderDetail("rent", lease);

    const rentSchedule = screen.getByRole("heading", { name: "Rent schedule" });
    const billingRules = screen.getByRole("heading", { name: "Billing rules" });
    expect(
      rentSchedule.compareDocumentPosition(billingRules) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Current billing rule")).not.toBeNull();
    expect(screen.getByText("Scheduled from 01 Jun 2027")).not.toBeNull();
    expect(screen.getByText("Billing rule history")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Change rules" })).not.toBeNull();
  });

  it("keeps date-only billing rule dates on their calendar day west of UTC", () => {
    const lease = makeLease();
    Object.assign(lease, {
      billingRules: [
        billingRule({
          effectiveFrom: "2026-08-01",
          effectiveTo: "2026-08-31",
          id: "billing-current",
          state: "current",
        }),
      ],
    });

    renderDetail("rent", lease);

    expect(
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "America/Los_Angeles",
        year: "numeric",
      }).format(new Date("2026-08-01")),
    ).toBe("31 Jul 2026");
    expect(screen.getByText("01 Aug 2026 - 31 Aug 2026")).not.toBeNull();
    expect(screen.queryByText(/31 Jul 2026/)).toBeNull();
  });

  it("shows no management fee when fee charging is disabled", () => {
    const lease = makeLease();
    Object.assign(lease, {
      billingRules: [
        billingRule({
          chargeManagementFeeWhenActive: false,
          id: "billing-current",
          managementFeeMode: "flat",
          managementFeeValue: 125,
          state: "current",
        }),
      ],
    });

    renderDetail("rent", lease);

    expect(screen.getByText("No management fee charged")).not.toBeNull();
    expect(screen.queryByText("125 flat fee")).toBeNull();
  });

  it("reuses the billing editor for an active effective-dated change", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    Object.assign(lease, {
      billingRules: [billingRule({ id: "billing-current", state: "current" })],
    });

    renderDetail("rent", lease);
    await user.click(screen.getByRole("button", { name: "Change rules" }));

    const drawer = screen.getByRole("dialog", { name: "Change billing rules" });
    expect(within(drawer).getByRole("combobox", { name: "Bill to" })).not.toBeNull();
    expect(
      within(drawer).getByRole("combobox", { name: "Who collects rent?" }),
    ).not.toBeNull();
    expect(within(drawer).getByText("Begins with the next unbilled month.")).not.toBeNull();
    expect(
      drawer.querySelector<HTMLInputElement>(
        'input[name="expectedCurrentBillingRuleId"]',
      )?.value,
    ).toBe("billing-current");
  });

  it("uses move-in and move-out language without exposing evidence state", () => {
    renderDetail("occupancy");

    expect(screen.getByText("Planned dates")).not.toBeNull();
    expect(screen.getByText("Confirmed dates")).not.toBeNull();
    expect(screen.getByText("Confirmation")).not.toBeNull();
    expect(screen.queryByText("Evidence")).toBeNull();
    expect(screen.queryByText("Accepted")).toBeNull();
  });

  it("keeps the current occupancy visible and historical occupancy collapsed", async () => {
    const user = userEvent.setup();
    const lease = makeLease();
    lease.occupancies.push({
      ...lease.occupancies[0]!,
      actualLabel: "01 Jan 2026 - 30 Jun 2026",
      evidenceState: "superseded",
      id: "occupancy-old",
      residentLabel: "Previous Tenant",
    });

    renderDetail("occupancy", lease);

    expect(screen.queryByText("Previous Tenant")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Move-in confirmation" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Occupancy history" }));
    expect(screen.getByText("Previous Tenant")).not.toBeNull();
  });

  it("uploads a file without leaving the lease record", async () => {
    const user = userEvent.setup();
    renderDetail("files");

    await user.click(screen.getByRole("button", { name: "Attach file" }));

    const dialog = screen.getByRole("dialog", { name: "Upload lease file" });
    const form = within(dialog).getByRole("form", {
      name: "Upload document form",
    });
    expect(
      form.querySelector<HTMLInputElement>('input[name="leaseId"]')?.value,
    ).toBe("lease-1");
    expect(
      form.querySelector<HTMLInputElement>('input[name="propertyId"]')?.value,
    ).toBe("property-1");
    expect(
      form.querySelector<HTMLInputElement>('input[name="unitId"]')?.value,
    ).toBe("unit-1");
  });

  it("does not let term-change authority activate, close, or archive a lease", () => {
    renderDetail("overview", makeLease(), {
      canActivate: false,
      canArchive: false,
      canChangeTerms: true,
      canClose: false,
      canPrepare: false,
    });

    expect(screen.getByRole("button", { name: "Renew lease" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Activate lease" })).toBeNull();
    expect(screen.queryByText("Terminate lease")).toBeNull();
  });

  it("does not expose any lease mutation to a view-only role", () => {
    renderDetail("overview", makeLease(), {
      canActivate: false,
      canArchive: false,
      canChangeTerms: false,
      canClose: false,
      canPrepare: false,
    });

    expect(screen.queryByRole("button", { name: "Renew lease" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage lease" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });
});

const allLeasePermissions = {
  canActivate: true,
  canArchive: true,
  canChangeTerms: true,
  canClose: true,
  canPrepare: true,
};

function renderDetail(
  activeSection: LeaseRecordSection,
  lease = makeLease(),
  permissions = allLeasePermissions,
  focus: {
    paymentResolution?: LeasePaymentResolutionData;
    routeNotice?: {
      href?: string;
      linkLabel?: string;
      message: string;
    };
  } = {},
) {
  return render(detailElement(activeSection, lease, permissions, focus));
}

function detailElement(
  activeSection: LeaseRecordSection,
  lease = makeLease(),
  permissions = allLeasePermissions,
  focus: {
    paymentResolution?: LeasePaymentResolutionData;
    routeNotice?: {
      href?: string;
      linkLabel?: string;
      message: string;
    };
  } = {},
) {
  return (
    <LeaseDetailScreen
      activeSection={activeSection}
      canRecordPayments
      canViewFinance
      lease={lease}
      paymentResolution={focus.paymentResolution}
      permissions={permissions}
      propertyOptions={[{ id: "property-1", label: "RIVER - Riverside House" }]}
      tenantOptions={[
        {
          archived: false,
          description: "Tenant",
          id: "person-1",
          label: "Alice Tenant",
          roles: ["tenant"],
        },
      ]}
      unitOptions={[
        { id: "unit-1", label: "Unit 2A", propertyId: "property-1" },
      ]}
      routeNotice={focus.routeNotice}
    />
  );
}

function resolutionFixture(): LeasePaymentResolutionData {
  return {
    invoice: {
      balanceDue: 258,
      billingPeriodStart: "2026-08-01",
      collectedByOwner: 0,
      collectionRoute: "through_ips",
      dueDate: "2026-08-05",
      generationSource: "scheduled",
      id: "invoice-1",
      invoiceNumber: "INV-202608-001",
      isProrated: false,
      issueDate: "2026-08-01",
      leaseId: "lease-1",
      lines: [
        {
          amount: 258,
          balanceDue: 258,
          id: "line-1",
          label: "August rent",
          lineType: "rent",
        },
      ],
      occupantLabels: ["Alice Tenant"],
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
      propertyLabel: "RIVER - Riverside House",
      recipientLabel: "Alice Tenant",
      settlements: [],
      totalAmount: 258,
      unitId: "unit-1",
      unitLabel: "Unit 2A",
    },
    nextInvoiceDueDate: "2026-09-05",
    ownerLabel: "Sokha Vannak",
    reconciliationSources: [
      { id: "source-1", label: "BANK - Operating", propertyId: null },
    ],
  };
}

function makeLease() {
  const lease = buildLeaseSummary({
    deposits: [
      {
        amount: 1200,
        archived_at: null,
        currency: "USD",
        deposit_type: "security",
        events: [],
        id: "deposit-1",
        lease_id: "lease-1",
        status: "active",
      },
    ],
    lease: {
      archived_at: null,
      deposit_amount: 1200,
      deposit_currency: "USD",
      id: "lease-1",
      lease_end_date: "2027-06-30",
      lease_start_date: "2026-07-01",
      monthly_rent_amount: 850,
      monthly_rent_currency: "USD",
      primary_tenant_person_id: "person-1",
      property_id: "property-1",
      status: "active",
      tenant_name: "Alice Tenant",
      unit_id: "unit-1",
    },
    property: { code: "RIVER", id: "property-1", name: "Riverside House" },
    terms: [
      {
        archived_at: null,
        end_date: "2027-06-30",
        id: "term-1",
        lease_id: "lease-1",
        payment_frequency: "monthly",
        rent_amount: 850,
        rent_currency: "USD",
        rent_due_day: 10,
        start_date: "2026-07-01",
        status: "active",
        term_sequence: 1,
      },
    ],
    unit: {
      floor: "2",
      id: "unit-1",
      property_id: "property-1",
      status: "occupied",
      unit_number: "2A",
    },
  });

  lease.occupancies = [
    {
      actualLabel: "01 Jul 2026 - Current",
      datesLabel: "01 Jul 2026 - Current",
      evidenceLabel: "Accepted",
      evidenceState: "accepted",
      id: "occupancy-1",
      residentLabel: "Alice Tenant",
      scheduledLabel: "01 Jul 2026 - 30 Jun 2027",
      statusLabel: "Occupied",
      unitHref: "/units/unit-1",
      unitLabel: "Unit 2A",
    },
  ];
  lease.documents = [
    {
      category: "Lease",
      fileName: "Lease agreement.pdf",
      id: "document-1",
      linkedRecordLabel: "Lease evidence",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedAt: "2026-07-01T00:00:00.000Z",
      url: "https://example.com/lease.pdf",
    },
  ];

  return lease;
}

function billingRule(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    billingRecipientKind: "individual",
    billingRecipientLabel: "Alice Tenant",
    billingRecipientPersonId: "person-1",
    chargeManagementFeeWhenActive: true,
    chargeThroughLeaseEnd: true,
    collectionRoute: "through_ips",
    effectiveFrom: "2026-07-01",
    effectiveTo: "2027-06-30",
    finalPeriodProratedAmount: null,
    firstPeriodProratedAmount: null,
    fullManagementFeeDuringProration: false,
    id: "billing-current",
    leaseEndProrationRule: "actual_days",
    leaseStartProrationRule: "actual_days",
    managementFeeMode: "percentage",
    managementFeeValue: 8,
    midPeriodRentChangeRule: "next_full_month",
    rentCalculationTimezone: "Asia/Bangkok",
    shortMonthDueDayRule: "last_calendar_day",
    state: "current",
    ...overrides,
  };
}
