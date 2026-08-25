import { describe, expect, it } from "vitest";
import {
  buildLeasePaymentResolutionHref,
  buildLeaseRecordHref,
  parseLeaseDetailQuery,
} from "@/features/leases/lease-detail-route";

describe("lease detail route", () => {
  it("defaults invalid or missing sections to overview", () => {
    expect(parseLeaseDetailQuery({})).toEqual({
      paymentInvoiceId: null,
      section: "overview",
    });
    expect(parseLeaseDetailQuery({ section: "unknown" })).toEqual({
      paymentInvoiceId: null,
      section: "overview",
    });
  });

  it.each(["overview", "rent", "occupancy", "files"] as const)(
    "accepts the %s record section",
    (section) => {
      expect(parseLeaseDetailQuery({ section })).toEqual({
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
      paymentInvoiceId: "30000000-0000-0000-0000-000000000001",
      section: "rent",
    });
  });

  it("does not enter focus without both exact parameters", () => {
    expect(parseLeaseDetailQuery({ action: "record-payment" })).toEqual({
      paymentInvoiceId: null,
      section: "overview",
    });
    expect(
      parseLeaseDetailQuery({ action: "owner-payment", invoiceId: "invoice-1" }),
    ).toEqual({ paymentInvoiceId: null, section: "overview" });
    expect(
      parseLeaseDetailQuery({
        action: "record-payment",
        invoiceId: "not-a-database-id",
      }),
    ).toEqual({ paymentInvoiceId: null, section: "overview" });
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
