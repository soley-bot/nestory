import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTrustedReport } from "./trusted-report";
import { parseReportSearchParams } from "../reports.filters";

const mocks = vi.hoisted(() => ({ context: vi.fn(), events: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/features/finance-operations/data/scoped-finance-context", async (importOriginal) => ({ ...await importOriginal<typeof import("@/features/finance-operations/data/scoped-finance-context")>(), loadScopedFinanceContext: mocks.context }));
vi.mock("./owner-profit-loss-events", () => ({ iterateOwnerProfitLossEvents: mocks.events }));
vi.mock("./profit-loss-funding-loader", () => ({ loadProfitLossFunding: async () => ({ contributionCents: BigInt(0), remainingBalanceCents: BigInt(0) }) }));
const property = "11111111-1111-4111-8111-111111111111";
const unit = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({});
  mocks.context.mockResolvedValue({
    properties: [{ id: property, code: "P1", name: "Property", archived_at: null }],
    units: [{ id: unit, property_id: property, unit_number: "A1", archived_at: null }],
  });
  mocks.events.mockImplementation(async function* () {});
});

async function report(params: Record<string, string>) {
  return getTrustedReport({ organizationId: "org", viewQuery: parseReportSearchParams({ report: "unit-profit-loss", month: "2026-08", ...params }) });
}
function expectBlocked(result: Awaited<ReturnType<typeof report>>) {
  expect(result.scopeValidation?.code).toBe("invalid_report_scope");
  expect(result.exportValidation).toMatchObject({ code: "invalid_report_scope", status: 400 });
  expect(result.summary).toEqual([]);
  expect(result.rows).toEqual([]);
  expect(mocks.events).not.toHaveBeenCalled();
}

describe("financial report scope guard", () => {
  it.each(["unit-profit-loss", "monthly-owner-activity", "transactions", "management-fees", "rent-roll", "rent-collections"])("rejects malformed scope before reading %s", async kind => {
    expectBlocked(await report({ report: kind, propertyId: "invalid-property" }));
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects malformed unit IDs instead of all units", async () => {
    expectBlocked(await report({ propertyId: property, unitId: "invalid-unit" }));
  });
  it("rejects unavailable properties", async () => {
    expectBlocked(await report({ propertyId: other }));
  });
  it("rejects unavailable units", async () => {
    expectBlocked(await report({ propertyId: property, unitId: other }));
  });
  it("rejects units belonging to a different property", async () => {
    mocks.context.mockResolvedValue({
      properties: [{ id: property, code: "P1", name: "Property", archived_at: null }, { id: other, code: "P2", name: "Other", archived_at: null }],
      units: [{ id: unit, property_id: other, unit_number: "A1", archived_at: null }],
    });
    expectBlocked(await report({ propertyId: property, unitId: unit }));
  });
  it("rejects archived units", async () => {
    mocks.context.mockResolvedValue({ properties: [{ id: property, code: "P1", name: "Property", archived_at: null }], units: [{ id: unit, property_id: property, unit_number: "A1", archived_at: "2026-08-01" }] });
    expectBlocked(await report({ propertyId: property, unitId: unit }));
  });
  it("keeps a valid empty unit report exportable", async () => {
    const result = await report({ propertyId: property, unitId: unit });
    expect(result.exportValidation).toBeUndefined();
    expect(result.scopeValidation).toBeUndefined();
    expect(mocks.events).toHaveBeenCalledOnce();
    expect(result.summary.find(metric => metric.label === "Net operating income")?.value).toBe("USD 0.00");
  });
  it("keeps an unfiltered empty portfolio exportable", async () => {
    mocks.context.mockResolvedValue({ properties: [], units: [] });
    const result = await report({});
    expect(result.exportValidation).toBeUndefined();
    expect(result.scopeValidation).toBeUndefined();
  });
});
