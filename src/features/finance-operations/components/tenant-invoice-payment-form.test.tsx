// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  FinanceOperationsActionState,
  FinanceOption,
  TenantInvoiceSummary,
} from "../finance-operations.types";

const actionMocks = vi.hoisted(() => ({
  confirmOwnerCollectionAction: vi.fn(),
  recordTenantInvoicePaymentAction: vi.fn(),
}));

vi.mock("../actions", () => actionMocks);

import {
  TenantInvoicePaymentForm,
  type TenantPaymentReceiptResult,
} from "./tenant-invoice-payment-form";

beforeAll(() => {
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  }
});

afterEach(() => {
  cleanup();
  actionMocks.confirmOwnerCollectionAction.mockReset();
  actionMocks.recordTenantInvoicePaymentAction.mockReset();
});

describe("TenantInvoicePaymentForm", () => {
  it("submits an IPS payment with the authoritative field names", () => {
    const { container } = renderForm({
      invoice: invoice({ collectionRoute: "through_ips" }),
      submitLabel: "Record USD 258.00 payment",
    });

    expect(screen.getByLabelText("Amount").getAttribute("name")).toBe("amount");
    expect(screen.getByRole("button", { name: "Received date" })).not.toBeNull();
    expect(
      container.querySelector('[name="settlementDate"]'),
    ).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Deposit to" })).not.toBeNull();
    expect(
      container.querySelector('[name="reconciliationSourceId"]'),
    ).not.toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Record USD 258.00 payment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("resets submission state and idempotency when the invoice identity changes", async () => {
    const firstSuccess = vi.fn();
    const nextSuccess = vi.fn();
    const nextReceipt = vi.fn();
    actionMocks.recordTenantInvoicePaymentAction.mockResolvedValueOnce({
      artifactHref: "/api/finance/documents/receipt-1",
      message: "Payment recorded.",
      paymentId: "payment-1",
      publicationStatus: "published",
      status: "success",
    });
    const view = render(
      paymentForm({
        invoice: invoice({ id: "invoice-1" }),
        onSuccess: firstSuccess,
      }),
    );
    const firstIdempotencyKey = valueOfNamedInput(
      view.container,
      "idempotencyKey",
    );

    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => {
      expect(firstSuccess).toHaveBeenCalledOnce();
    });

    view.rerender(
      paymentForm({
        invoice: invoice({
          id: "invoice-2",
          invoiceNumber: "INV-202608-002",
        }),
        onReceiptResult: nextReceipt,
        onSuccess: nextSuccess,
      }),
    );

    expect(valueOfNamedInput(view.container, "invoiceId")).toBe("invoice-2");
    expect(valueOfNamedInput(view.container, "idempotencyKey")).not.toBe(
      firstIdempotencyKey,
    );
    expect(nextReceipt).not.toHaveBeenCalled();
    expect(nextSuccess).not.toHaveBeenCalled();
  });

  it("ignores stale success and delivers each current result exactly once", async () => {
    const staleResult = deferredActionResult();
    const staleReceipt = vi.fn();
    const staleSuccess = vi.fn();
    const currentReceipt = vi.fn();
    const currentSuccess = vi.fn();
    const replacementReceipt = vi.fn();
    const replacementSuccess = vi.fn();
    actionMocks.recordTenantInvoicePaymentAction
      .mockImplementationOnce(() => staleResult.promise)
      .mockResolvedValueOnce({
        artifactHref: "/api/finance/documents/receipt-current",
        message: "Current payment recorded.",
        paymentId: "payment-current",
        publicationStatus: "published",
        status: "success",
      });
    const view = render(
      paymentForm({
        invoice: invoice({ id: "invoice-stale" }),
        onReceiptResult: staleReceipt,
        onSuccess: staleSuccess,
      }),
    );

    fireEvent.submit(view.container.querySelector("form")!);
    view.rerender(
      paymentForm({
        invoice: invoice({ id: "invoice-current" }),
        onReceiptResult: currentReceipt,
        onSuccess: currentSuccess,
      }),
    );

    await act(async () => {
      staleResult.resolve({
        artifactHref: "/api/finance/documents/receipt-stale",
        message: "Stale payment recorded.",
        paymentId: "payment-stale",
        publicationStatus: "published",
        status: "success",
      });
      await staleResult.promise;
    });

    expect(staleReceipt).not.toHaveBeenCalled();
    expect(staleSuccess).not.toHaveBeenCalled();
    expect(currentReceipt).not.toHaveBeenCalled();
    expect(currentSuccess).not.toHaveBeenCalled();

    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => {
      expect(currentReceipt).toHaveBeenCalledOnce();
      expect(currentSuccess).toHaveBeenCalledOnce();
    });

    view.rerender(
      paymentForm({
        invoice: invoice({ id: "invoice-current" }),
        onReceiptResult: replacementReceipt,
        onSuccess: replacementSuccess,
      }),
    );
    await act(async () => {});

    expect(currentReceipt).toHaveBeenCalledOnce();
    expect(currentSuccess).toHaveBeenCalledOnce();
    expect(replacementReceipt).not.toHaveBeenCalled();
    expect(replacementSuccess).not.toHaveBeenCalled();
  });

  it("keeps allocations collapsed unless more than one line is outstanding", () => {
    const view = renderForm({
      invoice: invoice({
        lines: [openLine("Rent", 200), openLine("Parking", 58)],
      }),
    });

    expect(screen.getByText("Change how payment is applied")).not.toBeNull();
    expect(
      view.container.querySelector('[name="allocation:line-rent"]'),
    ).not.toBeNull();
    expect(
      view.container.querySelector('[name="allocation:line-parking"]'),
    ).not.toBeNull();

    view.unmount();
    renderForm({
      invoice: invoice({
        lines: [openLine("Rent", 258), openLine("Parking", 0)],
      }),
    });
    expect(screen.queryByText("Change how payment is applied")).toBeNull();
  });

  it.each([
    {
      actionResult: {
        artifactHref: "/api/finance/documents/receipt-1",
        message: "Payment recorded.",
        paymentId: "payment-1",
        publicationStatus: "published" as const,
        status: "success" as const,
      },
      expectedReceipt: {
        href: "/api/finance/documents/receipt-1",
        paymentId: "payment-1",
        unavailable: false,
      },
      label: "publication succeeds",
    },
    {
      actionResult: {
        message: "Payment recorded. Receipt unavailable.",
        paymentId: "payment-2",
        publicationStatus: "failed" as const,
        status: "success" as const,
      },
      expectedReceipt: {
        href: null,
        paymentId: "payment-2",
        unavailable: true,
      },
      label: "publication fails",
    },
  ])(
    "reports receipt publication when $label without changing payment success",
    async ({ actionResult, expectedReceipt }) => {
      const onReceiptResult = vi.fn();
      const onSuccess = vi.fn();
      actionMocks.recordTenantInvoicePaymentAction.mockResolvedValueOnce(
        actionResult,
      );
      const { container } = renderForm({ onReceiptResult, onSuccess });

      fireEvent.submit(container.querySelector("form")!);

      await waitFor(() => {
        expect(onReceiptResult).toHaveBeenCalledWith(expectedReceipt);
      });
      expect(onSuccess).toHaveBeenCalledWith(actionResult.message);
    },
  );

  it("associates and focuses an authoritative payment error", async () => {
    const user = userEvent.setup();
    actionMocks.recordTenantInvoicePaymentAction.mockResolvedValueOnce({
      message: "The selected receiving account is unavailable.",
      status: "error",
    });
    const { container } = renderForm();
    const amount = screen.getByLabelText("Amount");
    const reference = screen.getByLabelText("Reference");

    await user.clear(amount);
    await user.type(amount, "125.50");
    await user.type(reference, "Bank transfer 42");
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    expect(form.getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.activeElement).toBe(alert);
    expect((amount as HTMLInputElement).value).toBe("125.50");
    expect((reference as HTMLInputElement).value).toBe("Bank transfer 42");
  });

  it("restores safe inputs and refocuses feedback for consecutive errors", async () => {
    const user = userEvent.setup();
    actionMocks.recordTenantInvoicePaymentAction
      .mockResolvedValueOnce({
        message: "The first receiving account is unavailable.",
        status: "error",
      })
      .mockResolvedValueOnce({
        message: "The replacement receiving account is unavailable.",
        status: "error",
      });
    const { container } = renderForm();
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    const reference = screen.getByLabelText("Reference") as HTMLInputElement;
    const form = container.querySelector("form")!;

    await user.clear(amount);
    await user.type(amount, "125.50");
    await user.type(reference, "First transfer");
    fireEvent.submit(form);

    const firstAlert = await screen.findByText(
      "The first receiving account is unavailable.",
    );
    expect(document.activeElement).toBe(firstAlert);
    expect(amount.value).toBe("125.50");
    expect(reference.value).toBe("First transfer");

    await user.clear(amount);
    await user.type(amount, "98.75");
    await user.clear(reference);
    await user.type(reference, "Replacement transfer");
    fireEvent.submit(form);

    const secondAlert = await screen.findByText(
      "The replacement receiving account is unavailable.",
    );
    expect(document.activeElement).toBe(secondAlert);
    expect(amount.value).toBe("98.75");
    expect(reference.value).toBe("Replacement transfer");
  });

  it("uses owner confirmation authority without exposing IPS deposit fields", async () => {
    actionMocks.confirmOwnerCollectionAction.mockResolvedValueOnce({
      message: "Owner collection confirmed.",
      status: "success",
    });
    const onSuccess = vi.fn();
    const { container } = renderForm({
      invoice: invoice({ collectionRoute: "direct_to_owner" }),
      onSuccess,
    });

    expect(screen.queryByLabelText("Deposit to")).toBeNull();
    expect(
      screen.getByText(/does not add cash to the property account/i),
    ).not.toBeNull();
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(actionMocks.confirmOwnerCollectionAction).toHaveBeenCalledOnce();
      expect(onSuccess).toHaveBeenCalledWith("Owner collection confirmed.");
    });
    expect(actionMocks.recordTenantInvoicePaymentAction).not.toHaveBeenCalled();
  });
});

function renderForm({
  invoice: invoiceValue = invoice({ collectionRoute: "through_ips" }),
  onReceiptResult = vi.fn(),
  onSuccess = vi.fn(),
  reconciliationSources = [source()],
  submitLabel,
}: {
  invoice?: TenantInvoiceSummary;
  onReceiptResult?: (result: TenantPaymentReceiptResult) => void;
  onSuccess?: (message: string) => void;
  reconciliationSources?: FinanceOption[];
  submitLabel?: string;
} = {}) {
  return render(
    paymentForm({
      invoice: invoiceValue,
      onReceiptResult,
      onSuccess,
      reconciliationSources,
      submitLabel,
    }),
  );
}

function paymentForm({
  invoice: invoiceValue,
  onReceiptResult = vi.fn(),
  onSuccess = vi.fn(),
  reconciliationSources = [source()],
  submitLabel,
}: {
  invoice: TenantInvoiceSummary;
  onReceiptResult?: (result: TenantPaymentReceiptResult) => void;
  onSuccess?: (message: string) => void;
  reconciliationSources?: FinanceOption[];
  submitLabel?: string;
}) {
  return (
    <TenantInvoicePaymentForm
      invoice={invoiceValue}
      onReceiptResult={onReceiptResult}
      onSuccess={onSuccess}
      reconciliationSources={reconciliationSources}
      submitLabel={submitLabel}
    />
  );
}

function valueOfNamedInput(container: HTMLElement, name: string) {
  return (container.querySelector(`[name="${name}"]`) as HTMLInputElement).value;
}

function deferredActionResult() {
  let resolve!: (result: FinanceOperationsActionState) => void;
  const promise = new Promise<FinanceOperationsActionState>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function invoice(
  overrides: Partial<TenantInvoiceSummary> = {},
): TenantInvoiceSummary {
  return {
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
    lines: [openLine("Rent", 258)],
    occupantLabels: ["Dara Tenant"],
    paidThroughIps: 0,
    paymentStatus: "unpaid",
    pdf: {
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    },
    propertyId: "property-1",
    propertyLabel: "HOME — Riverside Home",
    publicationSnapshot: null,
    recipientLabel: "Dara Tenant",
    settlements: [],
    totalAmount: 258,
    unitId: "unit-1",
    unitLabel: "HOME — Unit 01",
    ...overrides,
  };
}

function openLine(label: string, balanceDue: number) {
  return {
    amount: balanceDue,
    balanceDue,
    id: `line-${label.toLowerCase()}`,
    label,
    lineType: label.toLowerCase(),
  };
}

function source(): FinanceOption {
  return {
    id: "source-1",
    label: "BANK · Operating",
    propertyId: "property-1",
  };
}
