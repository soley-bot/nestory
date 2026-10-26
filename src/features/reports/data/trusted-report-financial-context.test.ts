import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { parseReportSearchParams } from "../reports.filters";
import { getTrustedReport } from "./trusted-report";

const { rpc, gaps, renderCache } = vi.hoisted(() => ({
  rpc: vi.fn(), gaps: vi.fn(), renderCache: new Map<string, unknown>(),
}));
// Model the layout's render cache while retaining the real financial read guard.
vi.mock("react", () => ({ cache: (read: (key: string) => unknown) => (key: string) => {
  if (!renderCache.has(key)) renderCache.set(key, read(key));
  return renderCache.get(key);
} }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("./monthly-rent-completeness", () => ({ loadMonthlyRentGaps: gaps }));

const lifecycle = { generation: 2, status: "open", financial_start_date: "2026-10-01", enforced: true };
const open = { context: lifecycle, source_revision: "4" };
const financeContext: ScopedFinanceContext = {
  properties: [], units: [], people: [], owner_assignments: [], leases: [], terms: [], billing_terms: [],
};

beforeEach(() => {
  renderCache.clear();
  rpc.mockReset().mockImplementation(async name => ({
    data: name === "get_financial_write_context" ? lifecycle : open, error: null,
  }));
  gaps.mockReset().mockResolvedValue([]);
});

function report(kind: string, params: Record<string, string> = {}) {
  return getTrustedReport({ organizationId: "org", financeContext,
    viewQuery: parseReportSearchParams({ report: kind, month: "2026-10", ...params }),
  });
}

function expectUnavailable(result: Awaited<ReturnType<typeof report>>) {
  expect(result.rows).toEqual([]);
  expect(result.summary).toEqual([]);
  expect(result.exportValidation).toMatchObject({ code: "financial_context_changed", status: 409 });
  expect(result.scopeValidation?.code).toBe("financial_context_changed");
}

describe.each(["monthly-owner-activity", "unit-profit-loss"])("%s actual-period financial fence", kind => {
  const unrelatedDateCases: Record<string, string>[] = [
    {},
    { dateFrom: "2026-10-01", dateTo: "2026-10-31" },
    { dateFrom: "not-a-date", dateTo: "2026-10-31" },
  ];
  it.each(unrelatedDateCases)("refuses a September report before sources despite unrelated date fields %j", async dates => {
    expectUnavailable(await report(kind, { month: "2026-09", ...dates }));
    expect(gaps).not.toHaveBeenCalled();
    expect(rpc.mock.calls.filter(([name]) => name === "get_financial_report_context")).toHaveLength(1);
  });

  it.each([
    { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
    { dateFrom: "not-a-date", dateTo: "2026-10-31" },
  ])("keeps a valid October monthly report guarded and exportable with unrelated fields %j", async dates => {
    const result = await report(kind, dates);
    expect(result.exportValidation).toBeUndefined();
    expect(result.scopeValidation).toBeUndefined();
    expect(result.financialGeneration).toBe(2);
    expect(gaps).toHaveBeenCalledOnce();
    expect(gaps.mock.calls[0][0].period).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(rpc.mock.calls.filter(([name]) => name === "get_financial_report_context")).toHaveLength(2);
  });

  it("does not bypass a frozen workspace when unrelated date fields are malformed", async () => {
    rpc.mockImplementation(async name => ({ data: name === "get_financial_write_context" ? lifecycle
      : { ...open, context: { ...lifecycle, status: "frozen" } }, error: null }));
    expectUnavailable(await report(kind, { dateFrom: "not-a-date" }));
    expect(gaps).not.toHaveBeenCalled();
  });

  it("refuses a source revision change during monthly report assembly", async () => {
    gaps.mockImplementation(async () => {
      rpc.mockResolvedValue({ data: { ...open, source_revision: "5" }, error: null });
      return [];
    });
    expectUnavailable(await report(kind));
    expect(gaps).toHaveBeenCalledOnce();
  });

  it("refuses a financial start date change during monthly report assembly", async () => {
    gaps.mockImplementation(async () => {
      rpc.mockResolvedValue({ data: { ...open, context: { ...lifecycle, financial_start_date: "2026-11-01" } }, error: null });
      return [];
    });
    expectUnavailable(await report(kind));
    expect(gaps).toHaveBeenCalledOnce();
  });
});

it("rejects an invalid extended date range without loading financial sources", async () => {
  const result = await report("transactions", { dateFrom: "2026-02-30", dateTo: "2026-03-01" });
  expect(result.rows).toEqual([]);
  expect(result.summary).toEqual([]);
  expect(result.exportValidation).toMatchObject({ code: "invalid_report_range", status: 400 });
  expect(gaps).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
