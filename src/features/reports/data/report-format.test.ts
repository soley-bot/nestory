import { describe, expect, it } from "vitest";

import { getReportExportFilename } from "@/features/reports/data/report-format";
import type {
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

describe("getReportExportFilename", () => {
  it("builds a scoped Excel filename", () => {
    expect(
      getReportExportFilename(
        {
          exportFilenameBase: "unit-profit-loss",
          kind: "unit-profit-loss",
          scopeLabel: "P1 - Property One",
        } as TrustedReport,
        {
          month: "2026-07",
          report: "unit-profit-loss",
        } as ReportsViewQuery,
        "xlsx",
      ),
    ).toBe("unit-profit-loss-2026-07-p1-property-one.xlsx");
  });
});
