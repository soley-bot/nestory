import { describe, expect, it } from "vitest";
import { buildTenantReceiptPdf } from "@/features/finance-operations/documents/receipt-pdf";
import type { TenantReceiptPdfModel } from "@/features/finance-operations/documents/commercial-document.types";

describe("tenant receipt PDF", () => {
  it("renders a deterministic A4 receipt with payment and allocation details", () => {
    const model = receiptModel();
    const first = buildTenantReceiptPdf(model);
    const second = buildTenantReceiptPdf(model);
    const text = pdfText(first);

    expect(first).toEqual(second);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595 842]");
    expect(text).toContain("RECEIPT");
    expect(text).toContain("RCT-2026-0018");
    expect(text).toContain("INV-2026-0042");
    expect(text).toContain("Independent Property Service");
    expect(text).toContain("billing@ips.example");
    expect(text).toContain("+855 12 345 678");
    expect(text).toContain("Sokha Chan");
    expect(text).toContain("The Peak Residence");
    expect(text).toContain("Unit 2807");
    expect(text).toContain("08 Aug 2026");
    expect(text).toContain("BANK-008182");
    expect(text).toContain("August 2026 rent");
    expect(text).toContain("Parking");
    expect(text).toContain("USD 500.00");
    expect(text).toContain("PAYMENT RECEIVED");
    expect(text).toContain("PAYMENT RECEIPT - NOT A TAX RECEIPT");
    expect(text).not.toContain("VAT amount");
    expect(text).not.toContain("Tax ID");
    expect(text).toContain("xref");
  });

  it("shows partial-payment balances in invoice-to-remaining order", () => {
    const text = pdfText(buildTenantReceiptPdf(receiptModel()));
    const labels = [
      "INVOICE TOTAL",
      "PREVIOUSLY PAID",
      "THIS PAYMENT",
      "REMAINING BALANCE",
    ];
    const positions = labels.map((label) => text.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(text).toContain("USD 1,250.00");
    expect(text).toContain("USD 250.00");
    expect(text).toContain("USD 500.00");
  });

  it("does not leak extra internal cost or markup fields", () => {
    const model = {
      ...receiptModel(),
      internalCost: "INTERNAL-COST-SECRET",
      internalMarkup: "INTERNAL-MARKUP-SECRET",
    };

    const text = pdfText(buildTenantReceiptPdf(model));

    expect(text).not.toContain("INTERNAL-COST-SECRET");
    expect(text).not.toContain("INTERNAL-MARKUP-SECRET");
  });

  it("wraps long allocations across pages and repeats the document header", () => {
    const allocations = Array.from({ length: 68 }, (_, index) => ({
      amount: `${index + 1}.00`,
      label:
        `Allocation ${index + 1} for a customer-facing obligation with a long description ` +
        "that wraps without crossing the payment amount column.",
    }));
    const text = pdfText(
      buildTenantReceiptPdf({ ...receiptModel(), allocations }),
    );

    expect(pdfPageCount(text)).toBeGreaterThan(1);
    expect(occurrences(text, "RECEIPT")).toBeGreaterThan(1);
    expect(occurrences(text, "RCT-2026-0018")).toBeGreaterThan(1);
    expect(text).toContain("Allocation 68");
    expect(text).toContain("REMAINING BALANCE");
  });

  it("renders a visible reversed label without creating a cancellation document", () => {
    const text = pdfText(
      buildTenantReceiptPdf({ ...receiptModel(), reversed: true }),
    );

    expect(text).toContain("REVERSED");
    expect(text).not.toContain("CANCELLATION");
  });
});

function receiptModel(): TenantReceiptPdfModel {
  return {
    allocations: [
      { amount: "450.00", label: "August 2026 rent" },
      { amount: "50.00", label: "Parking" },
    ],
    amountPreviouslyPaid: "250.00",
    currency: "USD",
    invoiceNumber: "INV-2026-0042",
    invoiceTotal: "1250.00",
    issuer: {
      contactEmail: "billing@ips.example",
      contactPhone: "+855 12 345 678",
      name: "Independent Property Service",
    },
    paymentAmount: "500.00",
    paymentDate: "2026-08-08",
    paymentReference: "BANK-008182",
    propertyLabel: "The Peak Residence",
    receiptNumber: "RCT-2026-0018",
    recipientLabel: "Sokha Chan",
    remainingBalance: "500.00",
    reversed: false,
    unitLabel: "Unit 2807",
  };
}

function pdfText(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

function pdfPageCount(text: string) {
  const match = /\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text);
  return Number(match?.[1] ?? 0);
}

function occurrences(text: string, value: string) {
  return text.split(value).length - 1;
}
