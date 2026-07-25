import { describe, expect, it } from "vitest";
import {
  getReportPackets,
  reportCatalog,
} from "@/features/reports/report-catalog";

describe("report catalog supporting copy", () => {
  it("uses one visible purpose line per library report", () => {
    for (const report of reportCatalog) {
      expect(report.bestFor.trim().length).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(report, "sources")).toBe(false);
    }
  });

  it("keeps descriptions for multi-report packets", () => {
    const packets = getReportPackets({ month: "2026-07", propertyId: "all" });

    for (const packet of packets) {
      expect(packet.description.trim().length).toBeGreaterThan(0);
      expect(packet.reports.trim().length).toBeGreaterThan(0);
    }
  });
});
