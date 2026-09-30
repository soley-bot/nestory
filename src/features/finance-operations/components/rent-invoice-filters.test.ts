import { describe, expect, it } from "vitest";
import type { TenantInvoiceSummary } from "@/features/finance-operations/finance-operations.types";
import {
  getRentInvoiceView,
  isVisibleTenantInvoice,
} from "./rent-invoice-filters";

function invoice(
  paymentStatus: TenantInvoiceSummary["paymentStatus"],
  id: string,
): TenantInvoiceSummary {
  return {
    balanceDue: paymentStatus === "voided" ? 0 : 1700,
    billingPeriodStart: "2026-09-01",
    collectedByOwner: 0,
    collectionRoute: "through_ips",
    dueDate: "2026-09-07",
    generationSource: "scheduled",
    id,
    invoiceNumber: `INV-${id}`,
    isProrated: false,
    issueDate: "2026-09-01",
    leaseId: "00000000-0000-4000-8000-000000000010",
    lines: [
      {
        amount: 1700,
        balanceDue: paymentStatus === "voided" ? 0 : 1700,
        id: "00000000-0000-4000-8000-000000000020",
        label: "Rent",
        lineType: "rent",
      },
    ],
    occupantLabels: ["Tenant"],
    paidThroughIps: 0,
    paymentStatus,
    pdf: {
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    },
    propertyId: "00000000-0000-4000-8000-000000000030",
    propertyLabel: "The Peak",
    publicationSnapshot: null,
    recipientLabel: "Tenant",
    settlements: [],
    totalAmount: 1700,
    unitId: "00000000-0000-4000-8000-000000000040",
    unitLabel: "The Peak #5008",
  };
}

describe("rent invoice visibility", () => {
  it("keeps voided invoices out of the daily Rent & collections view", () => {
    const current = invoice("unpaid", "current");
    const voided = invoice("voided", "voided");

    expect(
      getRentInvoiceView(
        [current, voided],
        new URLSearchParams(),
        "2026-09-28",
      ).filteredInvoices,
    ).toEqual([current]);
  });

  it("does not expose a voided invoice through a stale status query", () => {
    const current = invoice("unpaid", "current");
    const voided = invoice("voided", "voided");

    expect(
      getRentInvoiceView(
        [current, voided],
        new URLSearchParams("status=voided"),
        "2026-09-28",
      ).filteredInvoices,
    ).toEqual([current]);
  });

  it("retains an explicit visibility predicate for other daily finance views", () => {
    expect(isVisibleTenantInvoice(invoice("unpaid", "current"))).toBe(true);
    expect(isVisibleTenantInvoice(invoice("voided", "voided"))).toBe(false);
  });

  it("finds an other-income tenant invoice by a unit number with leading zeros", () => {
    const otherIncome = invoice("unpaid", "other-income");
    otherIncome.unitLabel = "Pilot Property · Unit 0009";
    otherIncome.lines = [{ ...otherIncome.lines[0]!, label: "Other income" }];

    expect(
      getRentInvoiceView(
        [otherIncome],
        new URLSearchParams({ q: "0009" }),
        "2026-09-28",
      ).filteredInvoices,
    ).toEqual([otherIncome]);
    expect(
      getRentInvoiceView(
        [otherIncome],
        new URLSearchParams({ q: "other income" }),
        "2026-09-28",
      ).filteredInvoices,
    ).toEqual([otherIncome]);
  });
});
