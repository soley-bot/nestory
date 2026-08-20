import { describe, expect, it } from "vitest";
import { buildTenantInvoicePdf } from "@/features/finance-operations/documents/invoice-pdf";
import type { TenantInvoicePdfModel } from "@/features/finance-operations/documents/commercial-document.types";

describe("tenant invoice PDF", () => {
  it("renders a deterministic A4 commercial invoice with all customer-facing details", () => {
    const model = invoiceModel();
    const first = buildTenantInvoicePdf(model);
    const second = buildTenantInvoicePdf(model);
    const text = pdfText(first);

    expect(first).toEqual(second);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595 842]");
    expect(text).toContain("INVOICE");
    expect(text).toContain("INV-2026-0042");
    expect(text).toContain("Independent Property Service");
    expect(text).toContain("billing@ips.example");
    expect(text).toContain("+855 12 345 678");
    expect(text).toContain("Sokha Chan");
    expect(text).toContain("Maly Chan");
    expect(text).toContain("Dara Chan");
    expect(text).toContain("The Peak Residence");
    expect(text).toContain("Unit 2807");
    expect(text).toContain("01 Aug 2026");
    expect(text).toContain("31 Aug 2026");
    expect(text).toContain("05 Aug 2026");
    expect(text).toContain("10 Aug 2026");
    expect(text).toContain("Monthly rent");
    expect(text).toContain("August 2026 rent");
    expect(text).toContain("Parking");
    expect(text).toContain("USD 1,250.00");
    expect(text).toContain("TOTAL DUE");
    expect(text).toContain("Pay by bank transfer to IPS operating");
    expect(text).toContain("account 001-9182.");
    expect(text).toContain("Please include the invoice number with payment.");
    expect(text).toContain("NOT A TAX INVOICE");
    expect(text).not.toContain("VAT amount");
    expect(text).not.toContain("Tax ID");
    expect(text).toContain("xref");
  });

  it("does not leak extra internal cost or markup fields", () => {
    const model = {
      ...invoiceModel(),
      internalCost: "INTERNAL-COST-SECRET",
      internalMarkup: "INTERNAL-MARKUP-SECRET",
    };

    const text = pdfText(buildTenantInvoicePdf(model));

    expect(text).not.toContain("INTERNAL-COST-SECRET");
    expect(text).not.toContain("INTERNAL-MARKUP-SECRET");
  });

  it("wraps long lines across pages and repeats the document header", () => {
    const lines = Array.from({ length: 58 }, (_, index) => ({
      amount: `${index + 1}.00`,
      description:
        `Operational charge ${index + 1} with a deliberately long customer-facing explanation ` +
        "that must wrap cleanly without crossing the amount column or the page footer.",
      label: `Service line ${index + 1}`,
    }));
    const text = pdfText(buildTenantInvoicePdf({ ...invoiceModel(), lines }));

    expect(pdfPageCount(text)).toBeGreaterThan(1);
    expect(occurrences(text, "INVOICE")).toBeGreaterThan(1);
    expect(occurrences(text, "INV-2026-0042")).toBeGreaterThan(1);
    expect(text).toContain("Service line 58");
    expect(text).toContain("TOTAL DUE");
  });

  it("splits one oversized line across pages without losing its content", () => {
    const description = [
      "OVERSIZED-LINE-START",
      ...Array.from({ length: 750 }, (_, index) => `detail-${index + 1}`),
      "OVERSIZED-LINE-END",
    ].join(" ");
    const text = pdfText(
      buildTenantInvoicePdf({
        ...invoiceModel(),
        lines: [{ amount: "1250.00", description, label: "Rent detail" }],
      }),
    );

    expect(pdfPageCount(text)).toBeGreaterThan(1);
    const secondHeader = text.indexOf(
      "INV-2026-0042",
      text.indexOf("INV-2026-0042") + 1,
    );
    expect(secondHeader).toBeGreaterThan(0);
    expect(text).toContain("OVERSIZED-LINE-START");
    expect(text).toContain("OVERSIZED-LINE-END");
    expect(text.indexOf("OVERSIZED-LINE-END")).toBeGreaterThan(secondHeader);
  });

  it("preserves complete long identity text instead of truncating it", () => {
    const text = pdfText(
      buildTenantInvoicePdf({
        ...invoiceModel(),
        occupantLabels: Array.from(
          { length: 12 },
          (_, index) => `Occupant ${index + 1} identity detail`,
        ).concat("FINAL-OCCUPANT-MARKER"),
        propertyLabel:
          "The Peak Residence North Tower with extended property identity FINAL-PROPERTY-MARKER",
        recipientLabel:
          "Sokha Chan and household billing recipient with complete legal display FINAL-RECIPIENT-MARKER",
        unitLabel:
          "Unit 2807, floor 28, east wing, building section FINAL-UNIT-MARKER",
      }),
    );

    expect(text).toContain("FINAL-RECIPIENT-MARKER");
    expect(text).toContain("FINAL-PROPERTY-MARKER");
    expect(text).toContain("FINAL-UNIT-MARKER");
    expect(text).toContain("FINAL-OCCUPANT-MARKER");
  });

  it("preserves Khmer commercial identity and line text deterministically", () => {
    const model: TenantInvoicePdfModel = {
      ...invoiceModel(),
      issuer: { name: "សេវាកម្មអចលនទ្រព្យឯករាជ្យ" },
      lines: [
        {
          amount: "1250.00",
          description: "ថ្លៃជួលប្រចាំខែសីហា",
          label: "ថ្លៃជួល",
        },
      ],
      occupantLabels: ["ម៉ាលី ចាន់", "ដារ៉ា ចាន់"],
      propertyLabel: "អគារដឹភីក",
      recipientLabel: "សុខា ចាន់",
      unitLabel: "បន្ទប់ ២៨០៧",
    };
    const first = buildTenantInvoicePdf(model);
    const second = buildTenantInvoicePdf(model);
    const text = pdfText(first);

    expect(first).toEqual(second);
    expect(text).toContain(pdfUnicodeHex("សេវាកម្មអចលនទ្រព្យឯករាជ្យ"));
    expect(text).toContain(pdfUnicodeHex("សុខា ចាន់"));
    expect(text).toContain(pdfUnicodeHex("អគារដឹភីក / បន្ទប់ ២៨០៧"));
    expect(text).toContain(
      pdfUnicodeHex("ថ្លៃជួល - ថ្លៃជួលប្រចាំខែសីហា"),
    );
  });

  it("renders a visible void label without creating a cancellation document", () => {
    const text = pdfText(
      buildTenantInvoicePdf({ ...invoiceModel(), voided: true }),
    );

    expect(text).toContain("VOID");
    expect(text).not.toContain("CANCELLATION");
  });

  it("embeds an issuer logo when one is supplied", () => {
    const model = invoiceModel();
    model.issuer.logo = {
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      height: 120,
      width: 240,
    };

    const text = pdfText(buildTenantInvoicePdf(model));

    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Logo Do");
  });

  it("rejects a logo that is not a valid positive-size JPEG asset", () => {
    const model = invoiceModel();
    model.issuer.logo = {
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      height: 0,
      width: 240,
    };

    expect(() => buildTenantInvoicePdf(model)).toThrow(
      "Issuer logo must be a positive-size JPEG image.",
    );
  });
});

function invoiceModel(): TenantInvoicePdfModel {
  return {
    billingPeriodEnd: "2026-08-31",
    billingPeriodStart: "2026-08-01",
    currency: "USD",
    dueDate: "2026-08-10",
    invoiceNumber: "INV-2026-0042",
    issueDate: "2026-08-05",
    issuer: {
      contactEmail: "billing@ips.example",
      contactPhone: "+855 12 345 678",
      name: "Independent Property Service",
    },
    lines: [
      {
        amount: "1200.00",
        description: "August 2026 rent",
        label: "Monthly rent",
      },
      { amount: "50.00", description: null, label: "Parking" },
    ],
    occupantLabels: ["Maly Chan", "Dara Chan"],
    note: "Please include the invoice number with payment.",
    paymentInstructions: "Pay by bank transfer to IPS operating account 001-9182.",
    propertyLabel: "The Peak Residence",
    recipientLabel: "Sokha Chan",
    totalAmount: "1250.00",
    unitLabel: "Unit 2807",
    voided: false,
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

function pdfUnicodeHex(value: string) {
  return `<${Buffer.from(value, "utf16le").swap16().toString("hex").toUpperCase()}>`;
}
