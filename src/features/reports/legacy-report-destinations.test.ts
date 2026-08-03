import { describe, expect, it } from "vitest";

import { getLegacyReportDestination } from "@/features/reports/legacy-report-destinations";

describe("getLegacyReportDestination", () => {
  it.each([
    ["rent-roll", "/units"],
    ["property-performance", "/overview?lens=finance"],
    ["income-expense", "/ledger"],
    [
      "lease-expiry",
      "/leases?status=current&endsWithin=60d&sort=end_asc",
    ],
    ["vacancy-risk", "/units?occupancy=unoccupied"],
    ["maintenance-cost", "/maintenance"],
    ["missing-data", "/overview?lens=records"],
    ["people-readiness", "/people"],
  ])("routes retired %s reports to their operating module", (kind, expected) => {
    expect(getLegacyReportDestination(kind)).toBe(expected);
  });

  it("keeps the old Unit Performance URL on the renamed report", () => {
    expect(getLegacyReportDestination("unit-performance")).toBe(
      "/reports/unit-profit-loss",
    );
  });

  it("returns null for unknown route segments", () => {
    expect(getLegacyReportDestination("unknown-report")).toBeNull();
  });
});
