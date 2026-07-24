import { describe, expect, it } from "vitest";

import {
  buildReportBuilderHref,
  getReportPackets,
  reportCatalog,
} from "@/features/reports/report-catalog";

describe("buildReportBuilderHref", () => {
  it("removes stale unit scope from generated Owner Statement links", () => {
    const query = new URLSearchParams({
      month: "2026-07",
      propertyId: "property-1",
      unitId: "unit-1",
      ownerPersonId: "owner-person-1",
    });

    expect(buildReportBuilderHref("owner-statement", query)).toBe(
      "/reports/owner-statement?month=2026-07&propertyId=property-1",
    );
    expect(buildReportBuilderHref("unit-performance", query)).toContain(
      "unitId=unit-1",
    );
    expect(buildReportBuilderHref("unit-performance", query)).not.toContain(
      "ownerPersonId",
    );
  });

  it("owns People Readiness inside the central report catalog and packets", () => {
    expect(
      reportCatalog.find((report) => report.kind === "people-readiness"),
    ).toMatchObject({
      category: "Operations",
      title: "People Readiness",
    });
    expect(
      getReportPackets({ month: "2026-07", propertyId: "all" }).find(
        (packet) => packet.title === "People Readiness",
      )?.href,
    ).toBe("/reports/people-readiness");
  });

  it("keeps only bounded People filters on central People Readiness links", () => {
    const query = new URLSearchParams({
      archiveState: "archived",
      month: "2026-07",
      peopleView: "staff",
      propertyId: "property-1",
      status: "vacant",
      unitId: "unit-1",
    });

    expect(buildReportBuilderHref("people-readiness", query)).toBe(
      "/reports/people-readiness?archiveState=archived&peopleView=staff",
    );
  });
});
