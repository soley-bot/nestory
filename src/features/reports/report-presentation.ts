import type { ReportsViewQuery, TrustedReport, TrustedReportRow } from "./reports.types";
import { formatExactCents, parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";

// Presentation is shared by the screen and download loaders. Monetary subtotals
// use the exact source decimals, never formatted cell text or floating point.
export function applyReportPresentation(report: TrustedReport, query: ReportsViewQuery): TrustedReport {
  if (report.scopeValidation || report.exportValidation) return report;
  const availableColumns = report.columns;
  const defaults: Partial<Record<TrustedReport["kind"], string>> = {
    transactions: "date,type,property,payee,description,amount",
    "management-fees": "date,property,unit,description,managementFees",
    "rent-roll": "property,unit,tenant,status,rent",
    "rent-collections": "property,tenant,invoice,dueDate,charges,received,outstanding,status",
  };
  const selected = new Set((query.columns || defaults[report.kind] || "").split(",").filter(Boolean));
  const columns = availableColumns.filter((column) => selected.size === 0 || selected.has(column.key));
  const groupKey = query.groupBy;
  if (!groupKey || groupKey === "none" || !availableColumns.some((column) => column.key === groupKey)) {
    return { ...report, availableColumns, columns: columns.length ? columns : availableColumns };
  }
  const grouped = new Map<string, TrustedReportRow[]>();
  for (const row of report.rows) {
    const value = row.cells[groupKey] || "Not specified";
    const label = groupKey === "unit" ? `${row.cells.property || row.propertyId || "Property"} / ${value}` : value;
    const rows = grouped.get(label) ?? [];
    rows.push(row);
    grouped.set(label, rows);
  }
  const rows: TrustedReportRow[] = [];
  for (const [label, members] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const cells: Record<string, string> = { [groupKey]: label };
    const amounts: Record<string, string> = {};
    for (const column of availableColumns.filter((column) => column.numeric)) {
      if (report.kind === "transactions" && column.key === "amount" && new Set(members.map((row) => row.cells.type)).size > 1) {
        cells.amount = "Mixed types";
        continue;
      }
      let total = BigInt(0);
      let present = false;
      for (const member of members) {
        const value = member.amounts?.[column.key];
        if (value === undefined) continue;
        total += parseExactMoneyToCents(value);
        present = true;
      }
      if (present) {
        const value = formatExactCents(total);
        amounts[column.key] = value;
        cells[column.key] = `USD ${value}`;
      }
    }
    rows.push({ id: `group:${groupKey}:${label}`, isGroup: true, title: `${label} · ${members.length} records`, cells, amounts, sourceCount: members.length, sourceLinks: [], sourceSummary: "Subtotal for all matching records in this group." }, ...members);
  }
  return { ...report, availableColumns, columns: columns.length ? columns : availableColumns, rows, totalRowCount: report.rows.length };
}
