import { describe, expect, it } from "vitest";

import {
  buildReportBuilderHref,
  buildOwnerStatementAuthorityHref,
  ownerStatementCatalogItem,
  reportCatalog,
  reportKindValues,
} from "@/features/reports/report-catalog";

describe("report catalog", () => {
  it("keeps two useful reports in the visible workspace", () => {
    expect(reportKindValues).toEqual([
      "monthly-owner-activity",
      "unit-profit-loss",
    ]);
    expect(reportCatalog.map(({ title }) => title)).toEqual([
      "Owner activity",
      "Monthly Unit Profit & Loss",
    ]);
  });
});

describe("official Owner Statement catalog boundary", () => {
  it("catalogs the statement only as immutable publication authority", () => {
    expect(ownerStatementCatalogItem).toEqual(expect.objectContaining({
      kind: "owner-statement",
      title: "Official Owner Statement",
    }));
    expect(() => buildOwnerStatementAuthorityHref({
      month: "2026-08",
      ownerPersonId: "00000000-0000-0000-0000-000000000003",
      propertyId: "00000000-0000-0000-0000-000000000002",
    })).toThrow("publication or closed revision");
  });

  it("links only an immutable publication or closed revision to close authority", () => {
    expect(buildOwnerStatementAuthorityHref({
      month: "2026-08",
      ownerPersonId: "00000000-0000-0000-0000-000000000003",
      propertyId: "00000000-0000-0000-0000-000000000002",
      publicationId: "00000000-0000-0000-0000-000000000004",
    })).toBe(
      "/balances?month=2026-08&propertyId=00000000-0000-0000-0000-000000000002" +
      "&ownerPersonId=00000000-0000-0000-0000-000000000003" +
      "&ownerStatementPublicationId=00000000-0000-0000-0000-000000000004",
    );
  });
});

describe("buildReportBuilderHref", () => {
  it("keeps unit scope only on Monthly Unit Profit & Loss links", () => {
    const query = new URLSearchParams({
      month: "2026-07",
      ownerPersonId: "owner-person-1",
      propertyId: "property-1",
      unitId: "unit-1",
    });

    expect(buildReportBuilderHref("unit-profit-loss", query)).toBe(
      "/reports/unit-profit-loss?month=2026-07&propertyId=property-1&unitId=unit-1",
    );
    expect(buildReportBuilderHref("monthly-owner-activity", query)).toBe(
      "/reports/monthly-owner-activity?month=2026-07&propertyId=property-1",
    );
  });
});
