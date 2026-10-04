import { ownerStatementCash } from "@/features/reports/data/owner-statement-cash";
import { profitLossSummaryRows, profitLossFundingNote, profitLossFundingHeading, profitLossBasisNote } from "./profit-loss-funding";
import type { OwnerStatementPresentation } from "@/features/reports/data/pdf";
import { formatCalendarDate } from "@/lib/dates/format";
import { strToU8, zipSync } from "fflate";
import { addCompanyLogo } from "./excel-logo";

import { getReportExportFilename } from "@/features/reports/data/report-format";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import type { OwnerStatementPublicationModel } from "@/features/reports/data/owner-statement-report";
import type {
  ReportExportValidation,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

type WorkbookRow = {
  role?: "columnHeader" | "data";
  numericValues?: Record<number, string>;
  style?: number;
  values: string[];
};

type ReportExcelPresentation = { organizationName: string; logo?: { bytes: Uint8Array; width: number; height: number } };

export async function getReportExcel(
  organizationId: string,
  viewQuery: ReportsViewQuery,
  organizationName = "Company not provided",
): Promise<
  | { body: Uint8Array; filename: string; validation?: never }
  | { body?: never; filename?: never; validation: ReportExportValidation }
> {
  const report = await getTrustedReport({ organizationId, viewQuery });

  if (report.exportValidation) {
    return { validation: report.exportValidation };
  }

  return {
    body: buildTrustedReportXlsx(report, { organizationName, logo: report.unitProfitLossLines ? await loadCompanyLogo(organizationId) : undefined }),
    filename: getReportExportFilename(report, viewQuery, "xlsx"),
  };
}

async function loadCompanyLogo(organizationId: string) {
  const [{ createSupabaseServerClient }, { loadReportCompanyLogo }] = await Promise.all([
    import("@/lib/db/server"), import("./owner-statement-presentation"),
  ]);
  return loadReportCompanyLogo(await createSupabaseServerClient(), organizationId);
}

export function buildTrustedReportXlsx(report: TrustedReport, presentation?: ReportExcelPresentation) {
  const rows = workbookRows(report);
  const headerRow = rows.findIndex(row => row.role === "columnHeader") + 1;
  const lastDataRow = rows.reduce((last, row, index) => row.role === "data" ? index + 1 : last, headerRow);
  const logo = report.unitProfitLossLines ? presentation?.logo : undefined;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(appPropertiesXml()),
    "docProps/core.xml": strToU8(corePropertiesXml(report)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(report.unitProfitLossLines ? profitLossStylesXml() : stylesXml(report.preserveRowDetails)),
    "xl/workbook.xml": strToU8(workbookXml()),
    "xl/worksheets/sheet1.xml": strToU8(
      report.unitProfitLossLines ? profitLossSheetXml(report, Boolean(logo)) : worksheetXml(rows, headerRow, lastDataRow, report.preserveRowDetails),
    ),
  };

  if (logo) addCompanyLogo(files, logo);
  return zipSync(files, { level: 6 });
}

export function buildOwnerStatementXlsx(
  model: OwnerStatementPublicationModel,
  presentation?: OwnerStatementPresentation,
  options: { includeDepositSummary?: boolean } = {},
) {
  const files = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(ownerStatementAppPropertiesXml()),
    "docProps/core.xml": strToU8(ownerStatementCorePropertiesXml(model)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(profitLossStylesXml()),
    "xl/workbook.xml": strToU8(ownerStatementWorkbookXml()),
    "xl/worksheets/sheet1.xml": strToU8(ownerStatementSheetXml(model, presentation, options)),
  };
  if (presentation?.logo) addCompanyLogo(files, presentation.logo);
  // ZIP stores local DOS date fields. A fixed local calendar value keeps the
  // official workbook byte-identical across clock buckets and host time zones.
  return zipSync(files, { level: 6, mtime: new Date(1980, 0, 1, 0, 0, 0) });
}

type OwnerWorkbookCell = {
  span?: number;
  style?: number;
  type?: "number" | "text";
  value: string;
};

function ownerStatementSheetXml(
  model: OwnerStatementPublicationModel,
  presentation: OwnerStatementPresentation | undefined,
  options: { includeDepositSummary?: boolean },
) {
  const cash = ownerStatementCash(model);
  const money = (cents: number): OwnerWorkbookCell => ({ style: 3, type: "number", value: centsDecimal(BigInt(cents)) });
  const balance = (label: string, cents: number): OwnerWorkbookCell[] => [{ style: 2, span: 8, value: label }, { ...money(cents), style: 8 }];
  const rows: OwnerWorkbookCell[][] = [
    [], [{ style: 1, span: 5, value: "Owner Statement" }], [],
    [{ style: 9, span: 5, value: ownerStatementPeriod(model.monthStart) }], [],
    [{ style: 4, span: 9, value: `Owner: ${presentation?.ownerName ?? "Not provided"} | Property: ${presentation?.propertyLabel ?? "Not provided"}` }],
    [{
      style: 4,
      span: 9,
      value: options.includeDepositSummary
        ? `Currency: ${model.currency} | Tenant deposits held separately: ${centsDecimal(BigInt(cash.depositCents))}`
        : `Currency: ${model.currency}`,
    }], [],
    ["Date", "Type", "Property", "Unit", "Name", "Category", "Cash Out", "Cash In", "Balance"].map(value => ({ style: 2, value })),
    balance("Opening balance", cash.openingCents),
    ...cash.transactions.filter(line => line.cashInCents !== 0 || line.cashOutCents !== 0).map(line => {
      const detail = presentation?.transactionDetails?.[line.lineNumber];
      if (!detail?.unit) throw new Error("Statement transaction unit attribution is required before export.");
      return [excelDateCell(line.date), { style: 4, value: line.cashInCents > 0 ? "Payment" : "Expense" },
        { style: 4, value: presentation?.propertyLabel ?? "Not provided" }, { style: 4, value: detail.unit },
        { style: 4, value: detail.name }, { style: 4, value: detail.category },
        money(line.cashOutCents), money(line.cashInCents), money(line.balanceCents)];
    }),
    [{ style: 2, span: 6, value: "Total" }, { ...money(cash.cashOutCents), style: 8 }, { ...money(cash.cashInCents), style: 8 }, { ...money(cash.closingCents), style: 8 }],
    balance("Closing balance", cash.closingCents),
  ];
  const sheet = ownerWorkbookSheetXml(rows, 9, [16, 14, 30, 24, 38, 32, 18, 18, 18]);
  return presentation?.logo ? sheet.replace("</worksheet>", '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></worksheet>') : sheet;
}

function ownerStatementPeriod(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return `${formatCalendarDate(monthStart)} - ${formatCalendarDate(end)}`;
}

function excelDateCell(value: string): OwnerWorkbookCell {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00.000Z`) : NaN;
  if (!Number.isFinite(date)) return { value };
  return { style: 5, type: "number", value: String((date - Date.UTC(1899, 11, 30)) / 86400000) };
}

function centsDecimal(cents: bigint) {
  const magnitude = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}${magnitude / BigInt(100)}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}

function profitLossSheetXml(report: TrustedReport, hasLogo: boolean) {
  const lines = report.unitProfitLossLines ?? [];
  const money = (cents: bigint): OwnerWorkbookCell => ({ style: 3, type: "number", value: centsDecimal(cents) });
  const heading = (...values: string[]) => values.map((value) => ({ style: 2, value }));
  const income = lines.filter((line) => line.direction === "income").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const expenses = lines.filter((line) => line.direction === "expense").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const detail = (direction: "income" | "expense"): OwnerWorkbookCell[][] => {
    const categories = direction === "income"
      ? ["Rent", "Utilities", "Other income"]
      : ["Cleaning", "Management fee", "Repairs and Maintenance", "Utilities", "Commission", "Other expense"];
    const categoryKey = (label: string) => {
      const key = label.trim().toLowerCase();
      return ({ "management fees": "management fee", repairs: "repairs and maintenance", "other expenses": "other expense" } as Record<string, string>)[key] ?? key;
    };
    const entries = lines.filter(line => line.direction === direction && line.amountCents !== BigInt(0));
    const ordered = categories.flatMap(category =>
      entries.filter(line => categoryKey(line.category) === categoryKey(category)));
    ordered.push(...entries.filter(line => !categories.some(category => categoryKey(line.category) === categoryKey(category))));
    return ordered.map(line => [
    { style: 4, value: line.category }, excelDateCell(line.date), { style: 4, value: direction === "income" ? "Payment" : line.type ?? "Expense" },
    { style: 4, value: line.name ?? "" }, { style: 4, value: line.unit },
    { style: 4, value: line.description }, money(line.amountCents),
    ]);
  };
  const total = (label: string, value: bigint | null): OwnerWorkbookCell[] => [
    { style: 2, value: label }, ...Array.from({ length: 5 }, () => ({ style: 2, value: "" })),
    value === null ? { style: 2, value: "Unavailable" } : { ...money(value), style: 8 },
  ];
  const rows: OwnerWorkbookCell[][] = [
    [],
    [{ style: 1, span: hasLogo ? 5 : 7, value: "Profit and loss details" }],
    [],
    [{ style: 9, span: hasLogo ? 5 : 7, value: report.periodLabel }],
    [],
    [{ style: 4, span: 7, value: report.unitProfitLossOwnerProperties?.length
      ? report.unitProfitLossOwnerProperties.map(({ ownerName, propertyName }) => `Owner: ${ownerName} | Property: ${propertyName}`).join("\n")
      : `Owner: Not provided | Property: ${report.scopeLabel}` }],
    [{ style: 4, span: 7, value: profitLossBasisNote }],
    heading("Account", "Date", "Type", "Name", "Unit", "Description", "Amount"),
    [{ style: 10, span: 7, value: "Income" }],
    ...detail("income"), total("Total Income", income),
    [{ style: 10, span: 7, value: "Expenses" }],
    ...detail("expense"), total("Total Expenses", expenses),
    ...profitLossSummaryRows(lines, report.unitProfitLossFunding).slice(2).flatMap(row => [
      ...(row.label === "Owner funding contributions" ? [[{ style: 10, span: 7, value: profitLossFundingHeading }]] : []),
      row.label === "Net operating income"
        ? total(row.label, row.amountCents)
        : [{ style: 4, value: row.label }, ...Array.from({ length: 5 }, () => ({ value: "" })),
          row.amountCents === null ? { value: "Unavailable" } : money(row.amountCents)]]),
    ...(report.unitProfitLossFunding ? [[], [{ style: 4, span: 7, value: profitLossFundingNote }],
      ...(report.unitProfitLossFunding.unavailableReason ? [[{ style: 4, span: 7, value: report.unitProfitLossFunding.unavailableReason }]] : [])] : []),
  ];
  const sheet = ownerWorkbookSheetXml(rows, 8, [32, 16, 14, 38, 32, 42, 18]);
  return hasLogo ? sheet.replace("</worksheet>", '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></worksheet>') : sheet;
}

function profitLossStylesXml() {
  const style = (font = 0, fill = 0, border = 0, number = 0, align = "left") =>
    `<xf numFmtId="${number}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`;
  return xml(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;(&quot;$&quot;#,##0.00);&quot;-&quot;"/><numFmt numFmtId="165" formatCode="mm/dd/yyyy"/></numFmts>` +
    `<fonts count="4"><font><sz val="14"/><name val="Calibri"/></font><font><sz val="24"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="16"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EEF5"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="3"><border/><border><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border><border><bottom style="hair"><color rgb="FFE2E8F0"/></bottom></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="11">${[style(), style(1), style(2, 2, 1), style(0, 0, 2, 164, "right"), style(0, 0, 2), style(0, 0, 2, 165), style(), style(), style(2, 2, 1, 164, "right"), style(3), style(2, 0, 1)].join("")}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
}

function ownerWorkbookSheetXml(
  rows: OwnerWorkbookCell[][],
  freezeRow: number,
  widths: number[],
) {
  const merges: string[] = [];
  const expandedRows = rows.map((row) => {
    let column = 0;
    return row.map((cell) => {
      const span = cell.span ?? (row.length === 1 && (cell.style === 1 || cell.style === 4) ? widths.length : 1);
      const result = { ...cell, column, span };
      column += span;
      return result;
    });
  });
  const rowXml = expandedRows.map((row, rowIndex) => {
    const height = row.length === 0 ? 12 : Math.min(409, Math.max(26, ...row.map((cell) => {
      if (cell.style === 1 || cell.style === 9 || cell.style === 7) return 34;
      const width = widths.slice(cell.column, cell.column + cell.span).reduce((sum, value) => sum + value, 0);
      const lines = cell.value.split("\n").reduce((sum, value) => sum + Math.max(1, Math.ceil(value.length / (width * 0.8))), 0);
      return lines * 14 + 12;
    })));
    const cells = row.map((cell) => {
      const ref = `${columnName(cell.column)}${rowIndex + 1}`;
      if (cell.span > 1) merges.push(`<mergeCell ref="${ref}:${columnName(cell.column + cell.span - 1)}${rowIndex + 1}"/>`);
      const style = cell.style === undefined ? "" : ` s="${cell.style}"`;
      if (cell.type === "number") return `<c r="${ref}"${style}><v>${escapeXml(cell.value)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  const columns = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("");
  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols>` +
    `<sheetData>${rowXml}</sheetData><mergeCells count="${merges.length}">${merges.join("")}</mergeCells><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
  );
}

function ownerStatementWorkbookXml() {
  return xml(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Statement" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
}


function ownerStatementCorePropertiesXml(model: OwnerStatementPublicationModel) {
  const generatedAt = escapeXml(model.generatedAt);
  return xml(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Owner Statement</dc:title><dc:creator>Nestory</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:modified></cp:coreProperties>`,
  );
}

function ownerStatementAppPropertiesXml() {
  return xml(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Nestory</Application><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Statement</vt:lpstr></vt:vector></TitlesOfParts></Properties>`);
}

function workbookRows(report: TrustedReport): WorkbookRow[] {
  const grouped = report.rows.some((row) => row.isGroup);
  const rows: WorkbookRow[] = [
    { style: 1, values: [report.title] },
    { values: ["Scope", report.scopeLabel] },
    { values: ["Period", report.periodLabel] },
    { values: ["Generated", report.generatedAt] },
    { values: [] },
    {
      role: "columnHeader",
      style: 2,
      values: [
        ...(grouped ? ["Group / subtotal"] : []),
        ...report.columns.map(({ label }) => label),
        "Source records",
        "Source IDs",
        "Source links",
      ],
    },
  ];

  if (report.rows.length === 0) {
    rows.push({
      values: [report.emptyTitle, report.emptyDescription],
    });
  } else {
    for (const row of report.rows) {
      const detailIndex = report.columns.findIndex(column => column.key === "detail");
      const detail = row.cells.detail ?? "";
      const parts = report.preserveRowDetails && detailIndex >= 0 ? Math.max(1, Math.ceil(detail.length / 500)) : 1;
      for (let part = 0; part < parts; part++) rows.push({
        role: "data",
        style: row.isGroup ? 2 : undefined,
        numericValues: row.isGroup || part > 0 ? {} : Object.fromEntries(report.columns.flatMap((column, index) => {
          const value = column.numeric ? row.amounts?.[column.key] : undefined;
          return value !== undefined && /^-?\d+(?:\.\d{1,2})?$/.test(value) ? [[index + (grouped ? 1 : 0), value]] : [];
        })),
        values: [
          ...(grouped ? [row.isGroup ? `Subtotal: ${row.title}` : ""] : []),
          ...report.columns.map(({ key }) => key === "detail" && report.preserveRowDetails ? detail.slice(part * 500, (part + 1) * 500)
            : key === "type" && part > 0 ? `${row.cells[key]} (continued)`
              : part > 0 && report.columns.find(column => column.key === key)?.numeric ? "" : row.cells[key] ?? ""),
          row.sourceLinks
            .map((source) => `${source.recordType}:${source.label}`)
            .join(" | "),
          row.sourceLinks.map((source) => source.id).join(" | "),
          row.sourceLinks
            .flatMap((source) => (source.href ? [source.href] : []))
            .join(" | "),
        ],
      });
    }
  }

  rows.push({ values: [] });
  rows.push({ style: 2, values: ["Totals"] });
  rows.push({ style: 2, values: ["Metric", "Value"] });

  for (const metric of report.summary) {
    rows.push({ values: [metric.label, metric.value] });
  }

  rows.push({ values: [] });
  if (report.preserveRowDetails) rows.push({ values: ["Report purpose", report.description] });
  rows.push({ values: ["Trace", report.totalsTraceLabel] });
  return report.preserveRowDetails ? splitPreservedWorkbookRows(rows, report.columns.findIndex(column => column.key === "type") + (grouped ? 1 : 0)) : rows;
}

// Excel caps row height at 409 points. Count hard breaks as well as wrapping;
// split text without adding/removing characters so evidence remains complete.
function wrappedLineCount(value: string, capacity: number) {
  return value.split(/\r\n|\r|\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / capacity)), 0);
}

function splitPreservedWorkbookRows(rows: WorkbookRow[], typeColumn: number) {
  const widths = columnWidths(rows);
  return rows.flatMap(row => {
    const chunks = row.values.map((value, column) => {
      const capacity = Math.max(10, Math.floor((widths[column] - 2) * 0.8));
      const parts: string[] = [];
      let current = "";
      for (const token of value.match(/\r\n|[\s\S]/g) ?? []) {
        if (current && wrappedLineCount(current + token, capacity) > 26) {
          parts.push(current);
          current = "";
        }
        current += token;
      }
      parts.push(current);
      return parts;
    });
    const count = Math.max(1, ...chunks.map(parts => parts.length));
    return Array.from({ length: count }, (_, part) => ({
      ...row,
      numericValues: part === 0 ? row.numericValues : {},
      values: chunks.map((parts, column) => part > 0 && column === typeColumn && row.numericValues && parts.length === 1 ? `${parts[0]} (continued)`
        : part > 0 && row.numericValues?.[column] !== undefined ? ""
        : parts.length === 1 ? parts[0] : parts[part] ?? ""),
    }));
  });
}

function worksheetXml(
  rows: WorkbookRow[],
  headerRow: number,
  lastDataRow: number,
  preserveDetails = false,
) {
  const widths = columnWidths(rows);
  const rowXml = rows
    .map(({ style, values, numericValues }, rowIndex) => {
      const cells = values
        .map((value, columnIndex) =>
          numericValues?.[columnIndex] !== undefined
            ? `<c r="${columnName(columnIndex)}${rowIndex + 1}" s="${style ?? 0}" t="n"><v>${numericValues[columnIndex]}</v></c>`
            : inlineStringCell(columnIndex, rowIndex, value, style),
        )
        .join("");
      const lines = Math.max(1, ...values.map((value, column) => wrappedLineCount(value, Math.max(10, Math.floor((widths[column] - 2) * 0.8)))));
      return `<row r="${rowIndex + 1}"${preserveDetails ? ` ht="${Math.min(409, Math.max(18, lines * 15 + 6))}" customHeight="1"` : ""}>${cells}</row>`;
    })
    .join("");
  const lastColumn = columnName(
    Math.max(1, rows.reduce((max, row) => Math.max(max, row.values.length), 0)) -
      1,
  );
  const columnsXml = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");

  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      `<cols>${columnsXml}</cols>` +
      `<sheetData>${rowXml}</sheetData>` +
      `<autoFilter ref="A${headerRow}:${lastColumn}${lastDataRow}"/>` +
      `</worksheet>`,
  );
}

function inlineStringCell(
  columnIndex: number,
  rowIndex: number,
  value: string,
  style?: number,
) {
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
  const styleAttribute = style === undefined ? "" : ` s="${style}"`;
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function columnWidths(rows: WorkbookRow[]) {
  const columnCount = Math.max(
    1,
    rows.reduce((max, row) => Math.max(max, row.values.length), 0),
  );

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const longest = rows.reduce(
      (max, row) => Math.max(max, row.values[columnIndex]?.length ?? 0),
      0,
    );
    return Math.min(48, Math.max(12, longest + 2));
  });
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";

  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }

  return name;
}

function contentTypesXml() {
  return xml(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `</Types>`,
  );
}

function rootRelationshipsXml() {
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
      `</Relationships>`,
  );
}

function workbookXml() {
  return xml(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`,
  );
}

function workbookRelationshipsXml() {
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
}

function stylesXml(preserveDetails = false) {
  return xml(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="3">` +
      `<font><sz val="11"/><name val="Aptos"/></font>` +
      `<font><b/><sz val="16"/><name val="Aptos"/></font>` +
      `<font><b/><sz val="11"/><name val="Aptos"/></font>` +
      `</fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"${preserveDetails ? ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' : '/>'}` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"${preserveDetails ? ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' : '/>'}` +
      `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"${preserveDetails ? ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' : '/>'}` +
      `</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`,
  );
}

function corePropertiesXml(report: TrustedReport) {
  const generatedAt = escapeXml(report.generatedAt);
  return xml(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escapeXml(report.title)}</dc:title>` +
      `<dc:creator>Nestory</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:modified>` +
      `</cp:coreProperties>`,
  );
}

function appPropertiesXml() {
  return xml(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>Nestory</Application>` +
      `</Properties>`,
  );
}

function xml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
