import { describe, expect, it } from "vitest";
import {
  buildLeasePaymentResolutionHref,
  buildLeaseRecordHref,
  parseLeaseDetailQuery,
} from "@/features/leases/lease-detail-route";

describe("lease detail route", () => {
  it("defaults invalid or missing sections to overview", () => {
    expect(parseLeaseDetailQuery({})).toEqual({
      paymentFocusRequested: false,
      paymentInvoiceId: null,
      section: "overview",
    });
    expect(parseLeaseDetailQuery({ section: "unknown" })).toEqual({
      paymentFocusRequested: false,
      paymentInvoiceId: null,
      section: "overview",
    });
  });

  it.each(["overview", "rent", "occupancy", "files"] as const)(
    "accepts the %s record section",
    (section) => {
      expect(parseLeaseDetailQuery({ section })).toEqual({
        paymentFocusRequested: false,
        paymentInvoiceId: null,
        section,
      });
    },
  );

  it("parses an exact invoice-backed payment action", () => {
    expect(
      parseLeaseDetailQuery({
        action: "record-payment",
        invoiceId: "30000000-0000-0000-0000-000000000001",
        section: "rent",
      }),
    ).toEqual({
      paymentFocusRequested: true,
      paymentInvoiceId: "30000000-0000-0000-0000-000000000001",
      section: "rent",
    });
  });

  it("marks exact payment actions with missing or malformed invoice IDs as requested but invalid", () => {
    expect(parseLeaseDetailQuery({ action: "record-payment" })).toEqual({
      paymentFocusRequested: true,
      paymentInvoiceId: null,
      section: "overview",
    });
    expect(
      parseLeaseDetailQuery({
        action: "record-payment",
        invoiceId: "not-a-database-id",
      }),
    ).toEqual({
      paymentFocusRequested: true,
      paymentInvoiceId: null,
      section: "overview",
    });
    expect(
      parseLeaseDetailQuery({
        action: ["record-payment", "owner-payment"],
        invoiceId: ["not-a-database-id", "30000000-0000-0000-0000-000000000002"],
      }),
    ).toEqual({
      paymentFocusRequested: true,
      paymentInvoiceId: null,
      section: "overview",
    });
  });

  it("does not mark unrelated actions as payment focus requests", () => {
    expect(
      parseLeaseDetailQuery({ action: "owner-payment", invoiceId: "invoice-1" }),
    ).toEqual({
      paymentFocusRequested: false,
      paymentInvoiceId: null,
      section: "overview",
    });
  });

  it("uses the first value for array-valued parameters", () => {
    expect(
      parseLeaseDetailQuery({
        action: ["record-payment", "owner-payment"],
        invoiceId: [
          "30000000-0000-0000-0000-000000000001",
          "30000000-0000-0000-0000-000000000002",
        ],
        section: ["rent", "overview"],
      }),
    ).toEqual({
      paymentFocusRequested: true,
      paymentInvoiceId: "30000000-0000-0000-0000-000000000001",
      section: "rent",
    });
  });

  it("builds the focused action and stable return URLs", () => {
    expect(
      buildLeasePaymentResolutionHref({
        invoiceId: "invoice-1",
        leaseId: "lease-1",
      }),
    ).toBe("/leases/lease-1?action=record-payment&invoiceId=invoice-1");
    expect(buildLeaseRecordHref({ leaseId: "lease-1" })).toBe(
      "/leases/lease-1",
    );
  });

  it("builds a stable full-record URL", () => {
    expect(
      buildLeaseRecordHref({ leaseId: "lease-1", section: "occupancy" }),
    ).toBe("/leases/lease-1?section=occupancy");
  });
});
