import { zipSync } from "fflate";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { getTrustedReport } from "./trusted-report";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";
import { getReportExportFilename } from "./report-format";
import { loadReportCompanyLogo } from "./owner-statement-presentation";
import { parseReportSearchParams } from "../reports.filters";
import type { ReportExportValidation } from "../reports.types";
import type { UnitProfitLossExportSelection } from "../unit-profit-loss-export";

// The route holds one financial generation and source revision around the entire
// bundle. Each report also retains its canonical completeness/attribution checks.
export async function getUnitProfitLossBundle(
  organizationId: string,
  organizationName: string,
  selection: UnitProfitLossExportSelection,
): Promise<{ body: Uint8Array; filename: string } | { validation: ReportExportValidation }> {
  const supabase = await createSupabaseServerClient();
  const financeContext = await loadScopedFinanceContext(supabase, organizationId,
    selection.propertyId === "all" ? undefined : selection.propertyId);
  const propertyIds = new Set(financeContext.properties.filter(property => property.archived_at === null
    && (selection.propertyId === "all" || property.id === selection.propertyId)).map(property => property.id));
  const unitsById = new Map(financeContext.units.filter(unit => propertyIds.has(unit.property_id)).map(unit => [unit.id, unit]));
  if (selection.unitIds.some(id => !unitsById.has(id))) {
    return { validation: { code: "invalid_report_scope", status: 400, message: "Choose available units belonging to the selected property." } };
  }
  const logo = selection.format === "xlsx" ? await loadReportCompanyLogo(supabase, organizationId) : undefined;
  const unitsByProperty = Map.groupBy(
    selection.unitIds.map((unitId, index) => ({ unitId, index })),
    ({ unitId }) => unitsById.get(unitId)!.property_id,
  );
  const files: [string, Uint8Array][] = [];
  let firstFailure:
    | { index: number; validation: ReportExportValidation }
    | { index: number; error: unknown }
    | undefined;
  // Hold one property's source rows at a time. The original index preserves the
  // selected ZIP order and distinguishes units whose labels slugify alike.
  for (const [propertyId, units] of unitsByProperty) {
    const bundlePropertyEvents = { organizationId, month: selection.month, propertyId };
    for (const { unitId, index } of units) {
      // Group members retain selection order. Only earlier selections can
      // take precedence over a failure found in another group.
      if (firstFailure && index >= firstFailure.index) break;
      try {
        const viewQuery = parseReportSearchParams({ report: "unit-profit-loss", month: selection.month, propertyId, unitId });
        const report = await getTrustedReport({ organizationId, supabase, financeContext, viewQuery, bundlePropertyEvents });
        let validation = report.exportValidation;
        if (!validation && (report.scopeValidation || report.unitProfitLossDetailScope !== "single-unit" || !report.unitProfitLossLines
          || report.unitProfitLossLines.some(line => line.unitId !== unitId))) {
          validation = { code: "invalid_unit_report", status: 409, message: "A selected unit report could not be verified. Reload the report before downloading." };
        }
        if (validation) {
          firstFailure = { index, validation };
          break;
        }
        const filename = `${String(index + 1).padStart(2, "0")}-${getReportExportFilename(report, viewQuery, selection.format)}`;
        const body = selection.format === "pdf"
          ? buildTrustedReportPdf({ organizationName, report })
          : buildTrustedReportXlsx(report, { organizationName, logo });
        files[index] = [filename, body];
      } catch (error) {
        firstFailure = { index, error };
        break;
      }
    }
  }
  if (firstFailure) {
    if ("error" in firstFailure) throw firstFailure.error;
    return { validation: firstFailure.validation };
  }
  return { body: zipSync(Object.fromEntries(files), { level: 0 }), filename: `unit-profit-loss-${selection.month}-${selection.format}.zip` };
}
