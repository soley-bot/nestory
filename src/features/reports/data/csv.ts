import { getReportsScreenData } from "@/features/reports/data/reports";
import type {
  OccupancyReport,
  ProfitLossReport,
  ProfitLossReportEntry,
  ReportsViewQuery,
} from "@/features/reports/reports.types";
import { formatMoney } from "@/lib/money/format";

export async function getReportCsv(
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  const data = await getReportsScreenData(organizationId, viewQuery);

  if (viewQuery.report === "profit-loss" && data.profitLossReport) {
    return {
      body: buildProfitLossCsv(data.profitLossReport),
      filename: `nestory-profit-loss-${viewQuery.month}.csv`,
    };
  }

  return {
    body: buildOccupancyCsv(data.occupancyReport),
    filename:
      viewQuery.status === "vacant"
        ? "nestory-vacant-units-report.csv"
        : "nestory-occupancy-report.csv",
  };
}

function buildOccupancyCsv(report?: OccupancyReport) {
  const rows = [
    [
      "No.",
      "Property Name",
      "Unit no. / Floor",
      "Type",
      "Inclusion",
      "Price",
      "Currency",
      "Property Code",
      "Remark",
    ],
  ];

  for (const [index, row] of (report?.rows ?? []).entries()) {
    rows.push([
      String(index + 1),
      row.propertyName,
      `${row.unitNumber} / ${row.floorLabel}`,
      row.typeLabel,
      row.inclusionLabel,
      row.rentAmount === undefined ? "" : String(row.rentAmount),
      row.rentCurrency ?? "",
      row.propertyCode,
      `${row.statusLabel} - ${row.remark}`,
    ]);
  }

  return toCsv(rows);
}

function buildProfitLossCsv(report: ProfitLossReport) {
  const rows = [
    [
      "Section",
      "Category",
      "Date",
      "Type",
      "Name",
      "Property",
      "Amount",
      "Currency",
      "Description",
    ],
  ];

  addProfitLossDirectionRows(rows, report.income.label, report.income.groups);
  rows.push([
    report.income.label,
    "Total Income",
    "",
    "",
    "",
    "",
    report.totalIncomeDisplay.primary,
    report.totalIncomeDisplay.primaryCurrency,
    "",
  ]);
  addProfitLossDirectionRows(rows, report.expenses.label, report.expenses.groups);
  rows.push([
    report.expenses.label,
    "Total Expenses",
    "",
    "",
    "",
    "",
    report.totalExpensesDisplay.primary,
    report.totalExpensesDisplay.primaryCurrency,
    "",
  ]);
  rows.push([
    "Net",
    "Net operating income",
    "",
    "",
    "",
    "",
    report.netOperatingIncomeDisplay.primary,
    report.netOperatingIncomeDisplay.primaryCurrency,
    "",
  ]);
  rows.push([
    "Net",
    "Other income",
    "",
    "",
    "",
    "",
    report.otherIncomeDisplay.primary,
    report.otherIncomeDisplay.primaryCurrency,
    "",
  ]);
  rows.push([
    "Net",
    "Other expenses",
    "",
    "",
    "",
    "",
    report.otherExpensesDisplay.primary,
    report.otherExpensesDisplay.primaryCurrency,
    "",
  ]);
  rows.push([
    "Net",
    "Net other income",
    "",
    "",
    "",
    "",
    report.netOtherIncomeDisplay.primary,
    report.netOtherIncomeDisplay.primaryCurrency,
    "",
  ]);
  rows.push([
    "Net",
    "Net income",
    "",
    "",
    "",
    "",
    report.netIncomeDisplay.primary,
    report.netIncomeDisplay.primaryCurrency,
    "",
  ]);

  return toCsv(rows);
}

function addProfitLossDirectionRows(
  rows: string[][],
  section: "Income" | "Expenses",
  groups: { category: string; entries: ProfitLossReportEntry[] }[],
) {
  for (const group of groups) {
    rows.push([section, group.category, "", "", "", "", "", "", ""]);

    for (const entry of group.entries) {
      rows.push([
        section,
        group.category,
        entry.date,
        entry.typeLabel,
        entry.name,
        entry.propertyLabel,
        formatMoney(entry.amount, entry.currency),
        entry.currency,
        entry.description,
      ]);
    }
  }
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function escapeCsvCell(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
