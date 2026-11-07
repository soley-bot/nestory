import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { getTrustedReport } from "./trusted-report";
import { loadReportCompanyLogo } from "./owner-statement-presentation";
import { getUnitProfitLossBundle } from "./unit-profit-loss-bundle";
import * as pdf from "./pdf";
import * as excel from "./excel";
import type { TrustedReport } from "../reports.types";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/finance-operations/data/scoped-finance-context", () => ({ loadScopedFinanceContext: vi.fn() }));
vi.mock("./trusted-report", () => ({ getTrustedReport: vi.fn() }));
vi.mock("./owner-statement-presentation", () => ({ loadReportCompanyLogo: vi.fn() }));

const property = "00000000-0000-4000-8000-000000000010";
const unit1 = "00000000-0000-4000-8000-000000000001";
const unit2 = "00000000-0000-4000-8000-000000000002";
const selection = { month: "2026-11", format: "pdf" as const, propertyId: property, unitIds: [unit1, unit2] };

function unitReport(unitId: string): TrustedReport {
  const number = unitId === unit1 ? 1 : 2;
  return {
    kind: "unit-profit-loss", title: "Monthly Unit Profit & Loss", exportFilenameBase: "unit-profit-loss",
    description: "", emptyDescription: "", emptyTitle: "", generatedAt: "2026-11-01T00:00:00Z",
    periodLabel: "01 Nov 2026 - 30 Nov 2026", scopeLabel: `Example / Unit A${number}`, totalsTraceLabel: "",
    rows: [], columns: [], summary: [], unitProfitLossDetailScope: "single-unit",
    unitProfitLossScopeNote: "Excludes 1 unassigned property transaction. Shared amounts have not been allocated to this unit.",
    unitProfitLossLines: [{ id: unitId, propertyId: property, unitId, property: "Example", unit: `Unit A${number}`,
      amountCents: BigInt(number * 50000), date: "2026-11-01", description: `Rent for A${number}`, category: "Rent", categoryCode: "rent",
      categoryId: null, reportingGroup: "rent", direction: "income", currency: "USD" }],
  };
}

beforeEach(() => {
    vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  vi.mocked(loadScopedFinanceContext).mockResolvedValue({ properties: [{ id: property, archived_at: null }], units: [unit1, unit2].map(id => ({ id, property_id: property })) } as never);
  vi.mocked(getTrustedReport).mockImplementation(async ({ viewQuery }) => unitReport(viewQuery.unitId));
  vi.mocked(loadReportCompanyLogo).mockResolvedValue(undefined);
});

describe("unit report bundle", () => {
  it.each(["pdf", "xlsx"] as const)("contains two independent %s files with unit scope", async format => {
    const bundle = await getUnitProfitLossBundle("org", "Example", { ...selection, format });
    if ("validation" in bundle) throw new Error(bundle.validation.message);
    const files = unzipSync(bundle.body);
    expect(Object.keys(files)).toHaveLength(2);
    for (const [index, [name, bytes]] of Object.entries(files).entries()) {
      const number = index + 1;
      expect(name).toContain(`unit-a${number}.${format}`);
      const text = format === "pdf" ? Buffer.from(bytes).toString("latin1") : strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]!);
      expect(text).toContain(`Unit A${number}`);
      expect(text).not.toContain(`Rent for A${number === 1 ? 2 : 1}`);
      if (format === "pdf") expect(text).not.toContain("Property / unit");
    }
    expect(loadScopedFinanceContext).toHaveBeenCalledTimes(1);
    expect(getTrustedReport).toHaveBeenCalledTimes(2);
    for (const [options] of vi.mocked(getTrustedReport).mock.calls) {
      expect(options.viewQuery.propertyId).toBe(property);
      expect(options.financeContext).toBeDefined();
    }
  });

  it("keeps both files even if labels slugify identically", async () => {
    vi.mocked(getTrustedReport).mockImplementation(async ({ viewQuery }) => ({ ...unitReport(viewQuery.unitId), scopeLabel: "Same label" }));
    const bundle = await getUnitProfitLossBundle("org", "Example", selection);
    if ("validation" in bundle) throw new Error(bundle.validation.message);
    expect(Object.keys(unzipSync(bundle.body))).toEqual(["01-unit-profit-loss-2026-11-same-label.pdf", "02-unit-profit-loss-2026-11-same-label.pdf"]);
  });

  it("rejects units outside the authorized property before generating any report", async () => {
    const result = await getUnitProfitLossBundle("org", "Example", { ...selection, unitIds: [unit1, "unavailable"] });
    expect(result).toMatchObject({ validation: { status: 400 } });
    expect(getTrustedReport).not.toHaveBeenCalled();
  });

  it("returns no partial ZIP if a later unit needs billing", async () => {
    vi.mocked(getTrustedReport).mockResolvedValueOnce(unitReport(unit1)).mockResolvedValueOnce({ ...unitReport(unit2), exportValidation: { status: 409, code: "monthly_rent_incomplete", message: "Review billing." } });
    const result = await getUnitProfitLossBundle("org", "Example", selection);
    expect(result).toEqual({ validation: { status: 409, code: "monthly_rent_incomplete", message: "Review billing." } });
  });

  it("fails closed if a source returns combined or misattributed unit details", async () => {
    vi.mocked(getTrustedReport).mockResolvedValue(unitReport(unit2));
    expect(await getUnitProfitLossBundle("org", "Example", selection)).toMatchObject({ validation: { status: 409, code: "invalid_unit_report" } });
  });

  it.each(["pdf", "xlsx"] as const)("keeps selection-order errors when a later %s renderer throws", async (format) => {
    const otherProperty = "00000000-0000-4000-8000-000000000020";
    const otherUnit = "00000000-0000-4000-8000-000000000003";
    vi.mocked(loadScopedFinanceContext).mockResolvedValue({
      properties: [property, otherProperty].map(id => ({ id, archived_at: null })),
      units: [{ id: unit1, property_id: property }, { id: otherUnit, property_id: otherProperty }, { id: unit2, property_id: property }],
    } as never);
    const billingError = { status: 409, code: "monthly_rent_incomplete", message: "Review billing." } as const;
    const earlierRenderError = new Error("Second selection could not render.");
    const laterRenderError = new Error("Third selection could not render.");
    const render = (report: TrustedReport) => {
      const unitId = report.unitProfitLossLines![0]!.unitId;
      if (unitId === unit2) throw laterRenderError;
      if (unitId === otherUnit) throw earlierRenderError;
      return new Uint8Array([1]);
    };
    vi.spyOn(pdf, "buildTrustedReportPdf").mockImplementation(({ report }) => render(report));
    vi.spyOn(excel, "buildTrustedReportXlsx").mockImplementation(render);
    const interleaved = { ...selection, format, propertyId: "all", unitIds: [unit1, otherUnit, unit2] };
    vi.mocked(getTrustedReport).mockImplementation(async ({ viewQuery }) =>
      viewQuery.unitId === otherUnit
        ? { ...unitReport(otherUnit), exportValidation: billingError }
        : unitReport(viewQuery.unitId));

    await expect(getUnitProfitLossBundle("org", "Example", interleaved)).resolves.toEqual({ validation: billingError });

    vi.mocked(getTrustedReport).mockImplementation(async ({ viewQuery }) => unitReport(viewQuery.unitId));
    await expect(getUnitProfitLossBundle("org", "Example", interleaved)).rejects.toBe(earlierRenderError);
  });

  it("reports the earliest selected unit's failure when two interleaved property groups fail", async () => {
    const otherProperty = "00000000-0000-4000-8000-000000000020";
    const otherUnit = "00000000-0000-4000-8000-000000000003";
    vi.mocked(loadScopedFinanceContext).mockResolvedValue({
      properties: [property, otherProperty].map(id => ({ id, archived_at: null })),
      units: [{ id: unit1, property_id: property }, { id: otherUnit, property_id: otherProperty }, { id: unit2, property_id: property }],
    } as never);
    const billingError = { status: 409, code: "monthly_rent_incomplete", message: "Review billing." } as const;
    vi.mocked(getTrustedReport).mockImplementation(async ({ viewQuery }) => {
      if (viewQuery.unitId === otherUnit) return { ...unitReport(otherUnit), exportValidation: billingError };
      return unitReport(unit1); // The third selection receives the wrong unit's details.
    });
    const result = await getUnitProfitLossBundle("org", "Example", {
      ...selection, propertyId: "all", unitIds: [unit1, otherUnit, unit2],
    });
    expect(result).toEqual({ validation: billingError });
  });
});
