import { afterEach, describe, expect, it, vi } from "vitest";
import { getPropertiesScreenData, getPropertySummaries } from "@/features/properties/data/properties";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { getUnitsScreenData, getUnitPropertyOptions } from "@/features/units/data/units";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import { getMonthlyOwnerActivityReport } from "@/features/reports/data/monthly-owner-activity-report";
import { getRentReport } from "@/features/reports/data/rent-reports";
import type { ReportsViewQuery } from "@/features/reports/reports.types";
import { createCappedReadHarness, type CappedRead } from "@/lib/db/complete-read.test-fixture";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  expectedUsd, makeDensePropertyScaleFixture, makeInvoiceHistoryScaleFixture,
  makeOwnerActivityScaleFixture, makePortfolioScaleFixture, SCALE_ORGANIZATION_ID,
} from "./scalability-read-fixture";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/photos/data/photos", () => ({
  getUnitPhotoThumbnailUrls: vi.fn(async () => new Map()),
  getPropertyPhotoThumbnailUrls: vi.fn(async () => new Map()),
  getAssetPhotosForScope: vi.fn(),
}));

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
function useHarness(tables: Parameters<typeof createCappedReadHarness>[0], apiRowCap = 1000) {
  const harness = createCappedReadHarness(tables, { apiRowCap });
  const client = harness.client as unknown as Client;
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return { ...harness, client };
}

function reportQuery(overrides: Partial<ReportsViewQuery> = {}): ReportsViewQuery {
  return {
    month: "2026-10", ownerPersonId: "all", peopleArchiveState: "active", peopleView: "relationship",
    propertyId: "all", report: "monthly-owner-activity", status: "all", unitId: "all", ...overrides,
  };
}

function expectScopedReads(reads: CappedRead[], apiRowCap = 1000) {
  expect(reads.length).toBeGreaterThan(0);
  for (const read of reads) {
    expect(read.filters, `${read.table} must explicitly scope the organization`).toContainEqual({
      method: "eq", column: "organization_id", value: SCALE_ORGANIZATION_ID,
    });
    expect(read.returnedRows).toBeLessThanOrEqual(apiRowCap);
  }
}

// These are actual exported loaders with a deterministic API-cap double.
// They do not establish database RLS behavior, concurrent performance, or capacity.
describe.sequential("scalability: actual loaders across a synthetic 1000-row API cap", () => {
  afterEach(() => vi.mocked(createSupabaseServerClient).mockReset());

  it.each([500, 1000, 1001])("returns exact portfolio totals and tail records for %i properties and units", async (size) => {
    const fixture = makePortfolioScaleFixture(size);
    const harness = useHarness(fixture.tables);
    const summaries = await getPropertySummaries(SCALE_ORGANIZATION_ID);
    expect(summaries).toHaveLength(size);
    expect(new Set(summaries.map(row => row.id))).toEqual(new Set(fixture.properties.map(row => row.id)));
    expect(summaries.reduce((total, row) => total + row.netIncomeUsd, 0)).toBe(fixture.expected.totalLedgerUsd);
    expect(summaries.every(row => row.units === 1 && row.currentLeaseCount === 1 && row.currentLeaseUnitCount === 1)).toBe(true);
    expect(summaries.at(-1)).toMatchObject({ id: fixture.expected.lastPropertyId, owner: `Synthetic owner ${size}` });

    const properties = await getPropertiesScreenData(SCALE_ORGANIZATION_ID, parsePropertySearchParams({ sort: "net_desc" }));
    expect(properties.pagination.totalCount).toBe(size);
    expect(properties.properties).toHaveLength(10);
    expect(properties.properties[0]).toMatchObject({ id: fixture.expected.lastPropertyId, netIncomeUsd: size });

    const units = await getUnitsScreenData(SCALE_ORGANIZATION_ID, parseUnitSearchParams({ sort: "rent_desc" }));
    expect(units.pagination.totalCount).toBe(size);
    expect(units.units).toHaveLength(10);
    expect(units.units[0]).toMatchObject({
      id: fixture.expected.lastUnitId, propertyId: fixture.expected.lastPropertyId,
      propertyCode: `P${String(size).padStart(5, "0")}`, rentUsd: 1000 + size,
      ledgerNetUsd: size, hasActiveLease: true, propertyOwnerName: `Synthetic owner ${size}`,
    });

    const options = await getUnitPropertyOptions(SCALE_ORGANIZATION_ID);
    expect(options).toHaveLength(size);
    expect(options.at(-1)?.id).toBe(fixture.expected.lastPropertyId);
    expectScopedReads(harness.reads);
  }, 30_000);

  it("keeps 1201 dense units, 6001 ledger rows, and another unit's older timeline event", async () => {
    const fixture = makeDensePropertyScaleFixture();
    const harness = useHarness(fixture.tables);
    const properties = await getPropertiesScreenData(SCALE_ORGANIZATION_ID, parsePropertySearchParams({}));
    expect(properties.pagination.totalCount).toBe(1);
    expect(properties.properties[0]).toMatchObject({
      units: 1201, occupiedUnits: 1201, currentLeaseCount: 1201, currentLeaseUnitCount: 1201,
      unitsWithoutCurrentLease: 0, netIncomeUsd: 6001,
    });
    const units = await getUnitsScreenData(SCALE_ORGANIZATION_ID, parseUnitSearchParams({ sort: "net_desc" }));
    expect(units.pagination.totalCount).toBe(1201);
    expect(units.units[0]).toMatchObject({ id: fixture.units[0].id, ledgerNetUsd: 6001, hasActiveLease: true });
    expect(units.units.find(row => row.id === fixture.units[1].id)?.latestTimelineEvent).toMatchObject({
      title: "Synthetic older event from the next unit",
    });
    expectScopedReads(harness.reads);
  }, 30_000);

  it.each([500, 1000])("reconciles %i units times 36 months of invoices, receipts and deposits to integer-cent totals", async (unitCount) => {
    const fixture = makeInvoiceHistoryScaleFixture(unitCount);
    const harness = useHarness(fixture.tables);
    // The product deliberately limits one report to 366 days. Exercise the
    // full 36-month history as three allowed windows, each above 5,000 rows.
    const reports = [];
    for (const [dateFrom, dateTo] of [
      ["2023-10-01", "2024-09-30"], ["2024-10-01", "2025-09-30"], ["2025-10-01", "2026-09-30"],
    ]) {
      const report = await getRentReport({
        organizationId: SCALE_ORGANIZATION_ID, supabase: harness.client, financeContext: fixture.context,
        viewQuery: reportQuery({ report: "rent-collections", dateFrom, dateTo }),
      });
      expect(report.rows).toHaveLength(unitCount * 12);
      expect(report.summary.map(metric => metric.value)).toEqual([
        expectedUsd(fixture.expected.chargesCents / BigInt(3)), expectedUsd(fixture.expected.receiptsCents / BigInt(3)),
        expectedUsd(fixture.expected.depositsCents / BigInt(3)), expectedUsd(fixture.expected.outstandingCents / BigInt(3)), "USD 0.00",
      ]);
      expect(report.summary.every(metric => metric.sourceCount === unitCount * 12)).toBe(true);
      reports.push(report);
    }
    const rows = reports.flatMap(report => report.rows);
    expect(rows).toHaveLength(fixture.expected.invoices);
    expect(new Set(rows.map(row => row.id))).toEqual(new Set(fixture.invoiceIds));
    expect(rows.reduce((total, row) => total + row.sourceLinks.length, 0)).toBe(fixture.expected.sourceLinks);
    expect(rows.every(row => row.sourceCount === 4 && row.amounts?.charges === "100.03" && row.amounts?.received === "50.02" && row.amounts?.depositsApplied === "10.01" && row.amounts?.outstanding === "40.00")).toBe(true);
    for (const table of Object.keys(fixture.tables).filter(table => table !== "rent_policy_versions")) {
      expect(harness.reads.filter(read => read.table === table).reduce((total, read) => total + (read.returnedRows ?? 0), 0)).toBe(fixture.expected.invoices);
    }
    expectScopedReads(harness.reads);
  }, 60_000);

  it("reconciles 36000 monthly owner entries across 1000 properties without foreign-scope sentinels", async () => {
    const fixture = makeOwnerActivityScaleFixture();
    const harness = useHarness(fixture.tables);
    const report = await getMonthlyOwnerActivityReport({
      organizationId: SCALE_ORGANIZATION_ID, supabase: harness.client, financeContext: fixture.context, viewQuery: reportQuery(),
    });
    expect(report.rows).toHaveLength(1000);
    expect(report.summary.find(metric => metric.label === "Rent")).toMatchObject({ value: "USD 360.00", sourceCount: 36000 });
    expect(report.rows.every(row => row.sourceCount === 36 && row.cells.rent === "USD 0.36" && row.cells.netChange === "USD 0.36")).toBe(true);
    expect(report.rows.reduce((total, row) => total + row.sourceLinks.length, 0)).toBe(36000);
    expect(new Set(report.rows.flatMap(row => row.sourceLinks.map(link => link.id))).size).toBe(36000);
    expect(harness.reads.reduce((total, read) => total + (read.returnedRows ?? 0), 0)).toBe(36000);
    expectScopedReads(harness.reads);
  }, 30_000);

  it("continues through a lower 137-row API cap without losing the last 1201st owner entry", async () => {
    const fixture = makeOwnerActivityScaleFixture(1, 1201);
    const harness = useHarness(fixture.tables, 137);
    const report = await getMonthlyOwnerActivityReport({
      organizationId: SCALE_ORGANIZATION_ID, supabase: harness.client, financeContext: fixture.context, viewQuery: reportQuery(),
    });
    expect(report.summary.find(metric => metric.label === "Rent")).toMatchObject({ value: "USD 12.01", sourceCount: 1201 });
    expect(report.rows[0].sourceLinks).toHaveLength(1201);
    expect(harness.reads).toHaveLength(9);
    expect(harness.reads.at(-1)?.range?.[0]).toBe(1096);
    expectScopedReads(harness.reads, 137);
  });
});
