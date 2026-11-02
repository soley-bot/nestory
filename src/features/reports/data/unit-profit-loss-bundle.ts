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
  const files: Record<string, Uint8Array> = {};
  // Sequential, bounded exports avoid multiplying report source queries without
  // limits. A blocked unit aborts the whole download, never a partial ZIP.
  for (const [index, unitId] of selection.unitIds.entries()) {
    const viewQuery = parseReportSearchParams({ report: "unit-profit-loss", month: selection.month,
      propertyId: unitsById.get(unitId)!.property_id, unitId });
    const report = await getTrustedReport({ organizationId, supabase, financeContext, viewQuery });
    if (report.exportValidation) return { validation: report.exportValidation };
    if (report.scopeValidation || report.unitProfitLossDetailScope !== "single-unit" || !report.unitProfitLossLines
      || report.unitProfitLossLines.some(line => line.unitId !== unitId)) {
      return { validation: { code: "invalid_unit_report", status: 409, message: "A selected unit report could not be verified. Reload the report before downloading." } };
    }
    // Numbering also protects distinct units whose display labels slugify alike.
    const filename = `${String(index + 1).padStart(2, "0")}-${getReportExportFilename(report, viewQuery, selection.format)}`;
    files[filename] = selection.format === "pdf"
      ? buildTrustedReportPdf({ organizationName, report })
      : buildTrustedReportXlsx(report, { organizationName, logo });
  }
  return { body: zipSync(files, { level: 0 }), filename: `unit-profit-loss-${selection.month}-${selection.format}.zip` };
}
