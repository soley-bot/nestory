import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTrustedReport } from "./trusted-report";
import { parseReportSearchParams } from "../reports.filters";

const loaders = vi.hoisted(() => ({ transactions: vi.fn(), rent: vi.fn() }));
vi.mock("./transaction-report", () => ({ getTransactionReport: loaders.transactions }));
vi.mock("./rent-reports", () => ({ getRentReport: loaders.rent }));

describe("report source failure boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each(["transactions", "management-fees", "rent-roll", "rent-collections"])("blocks %s exports when source loading fails", async (report) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loaders.transactions.mockRejectedValue(new Error("Incomplete source page"));
    loaders.rent.mockRejectedValue(new Error("Incomplete source page"));
    try {
      const result = await getTrustedReport({ organizationId: "org", viewQuery: parseReportSearchParams({ report, month: "2026-09" }) });
      expect(result.rows).toEqual([]);
      expect(result.summary).toEqual([]);
      expect(result.exportValidation).toMatchObject({ code: "report_source_unavailable", status: 409 });
      expect(result.scopeValidation).toBeDefined();
    } finally { log.mockRestore(); }
  });

  it("rejects invalid dates before reading sources", async () => {
    const result = await getTrustedReport({ organizationId: "org", viewQuery: parseReportSearchParams({ report: "transactions", dateFrom: "2026-02-30", dateTo: "2026-03-01" }) });
    expect(result.exportValidation?.status).toBe(400);
    expect(loaders.transactions).not.toHaveBeenCalled();
    expect(loaders.rent).not.toHaveBeenCalled();
  });
});
