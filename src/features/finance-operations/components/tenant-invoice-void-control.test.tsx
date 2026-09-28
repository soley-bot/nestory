// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TenantInvoiceSummary } from "@/features/finance-operations/finance-operations.types";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../transaction-delete-actions", () => ({
  deleteTransactionAction: mocks.action,
}));

import { TenantInvoiceVoidControl } from "./tenant-invoice-void-control";

beforeAll(() => {
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
    });
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function invoice(
  overrides: Partial<TenantInvoiceSummary> = {},
): TenantInvoiceSummary {
  return {
    balanceDue: 1700,
    billingPeriodStart: "2026-09-01",
    collectedByOwner: 0,
    collectionRoute: "through_ips",
    dueDate: "2026-09-07",
    generationSource: "scheduled",
    id: "00000000-0000-4000-8000-000000000001",
    invoiceNumber: "INV-202609-5008",
    isProrated: false,
    issueDate: "2026-09-01",
    leaseId: "00000000-0000-4000-8000-000000000002",
    lines: [
      {
        amount: 1700,
        balanceDue: 1700,
        id: "00000000-0000-4000-8000-000000000003",
        label: "Rent",
        lineType: "rent",
      },
    ],
    occupantLabels: ["Tenant"],
    paidThroughIps: 0,
    paymentStatus: "unpaid",
    pdf: {
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    },
    propertyId: "00000000-0000-4000-8000-000000000004",
    propertyLabel: "The Peak",
    publicationSnapshot: null,
    recipientLabel: "Tenant",
    settlements: [],
    totalAmount: 1700,
    unitId: "00000000-0000-4000-8000-000000000005",
    unitLabel: "The Peak #5008",
    ...overrides,
  };
}

describe("TenantInvoiceVoidControl", () => {
  it("uses explicit void language and closes the parent detail after success", async () => {
    mocks.action.mockResolvedValue({
      message: "Invoice voided. Its audit history is retained.",
      status: "success",
    });
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <TenantInvoiceVoidControl
        canCorrectFinance
        invoice={invoice()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Void invoice" }));
    expect(screen.getByRole("dialog", { name: "Void invoice" })).not.toBeNull();
    expect(screen.getByText(/current balances and Rent & collections/)).not.toBeNull();
    expect(screen.getByLabelText("Reason for voiding")).not.toBeNull();

    await user.type(
      screen.getByLabelText("Reason for voiding"),
      "Wrong unit activated",
    );
    await user.click(screen.getByRole("button", { name: "Void invoice" }));

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        "Invoice voided. Its audit history is retained.",
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not offer voiding after the invoice is voided or while a payment remains active", () => {
    const { rerender } = render(
      <TenantInvoiceVoidControl
        canCorrectFinance
        invoice={invoice({ paymentStatus: "voided" })}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();

    rerender(
      <TenantInvoiceVoidControl
        canCorrectFinance
        invoice={invoice({
          paymentStatus: "partly_paid",
          settlements: [
            {
              amount: 100,
              date: "2026-09-10",
              id: "00000000-0000-4000-8000-000000000006",
              isReversed: false,
              receipt: null,
              receiptNumber: null,
              reference: null,
              reversalReason: null,
              route: "through_ips",
            },
          ],
        })}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();
  });
});
