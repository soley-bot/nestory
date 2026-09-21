import { ownerStatementCash } from "@/features/reports/data/owner-statement-cash";
import type { OwnerStatementPresentation } from "@/features/reports/data/pdf";
import { formatCalendarDate } from "@/lib/dates/format";
import { strToU8, zipSync } from "fflate";

import { getReportExportFilename } from "@/features/reports/data/report-format";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import type { OwnerStatementPublicationModel } from "@/features/reports/data/owner-statement-report";
import type {
  ReportExportValidation,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

type WorkbookRow = {
  numericValues?: Record<number, string>;
  style?: number;
  values: string[];
};

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
    body: buildTrustedReportXlsx(report, { organizationName }),
    filename: getReportExportFilename(report, viewQuery, "xlsx"),
  };
}

export function buildTrustedReportXlsx(report: TrustedReport, presentation?: { organizationName: string }) {
  const rows = workbookRows(report);
  const headerRow = 6;
  const lastDataRow = Math.max(headerRow, headerRow + report.rows.length);
  const files = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(appPropertiesXml()),
    "docProps/core.xml": strToU8(corePropertiesXml(report)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(report.unitProfitLossLines ? ownerStatementStylesXml() : stylesXml()),
    "xl/workbook.xml": strToU8(workbookXml()),
    "xl/worksheets/sheet1.xml": strToU8(
      report.unitProfitLossLines ? profitLossSheetXml(report, presentation?.organizationName ?? "Company not provided") : worksheetXml(rows, headerRow, lastDataRow),
    ),
  };

  return zipSync(files, { level: 6 });
}

export function buildOwnerStatementXlsx(model: OwnerStatementPublicationModel, presentation?: OwnerStatementPresentation) {
  const files = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(ownerStatementAppPropertiesXml()),
    "docProps/core.xml": strToU8(ownerStatementCorePropertiesXml(model)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(ownerStatementStylesXml()),
    "xl/workbook.xml": strToU8(ownerStatementWorkbookXml()),
    "xl/worksheets/sheet1.xml": strToU8(ownerStatementSheetXml(model, presentation)),
  };
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

function ownerStatementSheetXml(model: OwnerStatementPublicationModel, presentation?: OwnerStatementPresentation) {
  const cash = ownerStatementCash(model);
  const money = (cents: number): OwnerWorkbookCell => ({ style: 3, type: "number", value: centsDecimal(BigInt(cents)) });
  const heading = (...values: string[]) => values.map((value) => ({ style: 2, value }));
  const register = (cells: OwnerWorkbookCell[]) => cells.map((cell, index) => ({ ...cell, span: [4, 6, 13, 3, 3, 3][index] }));
  const rows: OwnerWorkbookCell[][] = [
    [{ style: 10, span: 16, value: presentation?.organizationName ?? "Company not provided" }, { style: 9, span: 16, value: "OWNER STATEMENT" }],
    [{ span: 16, value: "Property management" }, { style: 11, span: 16, value: `Currency: ${model.currency}` }],
    [],
    [{ style: 12, span: 10, value: "OWNER" }, { style: 12, span: 12, value: "PROPERTY" }, { style: 13, span: 10, value: "PERIOD" }],
    [{ style: 10, span: 10, value: presentation?.ownerName ?? "Not provided" }, { style: 10, span: 12, value: presentation?.propertyLabel ?? "Not provided" }, { style: 11, span: 10, value: ownerStatementPeriod(model.monthStart) }],
    [],
    ...[
      ["Opening balance", "Cash in", "Cash out", "Closing balance"].map((value) => ({ style: 6, span: 8, value })),
      [cash.openingCents, cash.cashInCents, cash.cashOutCents, cash.closingCents].map((value) => ({ ...money(value), style: 7, span: 8 })),
    ],
    [],
    [{ style: 4, span: 4, value: "Tenant deposits" }, { ...money(cash.depositCents), span: 3 }],
    [],
    register(heading("Date", "Type", "Details", "Cash out", "Cash in", "Balance").map((cell, index) => ({ ...cell, style: index >= 3 ? 8 : 2 }))),
    register([excelDateCell(model.monthStart), { value: "Opening balance" }, { value: "" }, money(0), money(0), money(cash.openingCents)]),
    ...cash.transactions.map((line) => register([
      excelDateCell(line.date), { style: 4, value: line.type }, { style: 4, value: line.details },
      money(line.cashOutCents), money(line.cashInCents), money(line.balanceCents),
    ])),
    register([{ value: "" }, { value: "" }, { style: 13, value: "Period totals" }, money(cash.cashOutCents), money(cash.cashInCents), money(cash.closingCents)]),
  ];
  return ownerWorkbookSheetXml(rows, 12, Array.from({ length: 32 }, () => 5));
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

function profitLossSheetXml(report: TrustedReport, organizationName: string) {
  const lines = report.unitProfitLossLines ?? [];
  const money = (cents: bigint): OwnerWorkbookCell => ({ style: 3, type: "number", value: centsDecimal(cents) });
  const heading = (...values: string[]) => values.map((value) => ({ style: 2, value }));
  const income = lines.filter((line) => line.direction === "income").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const expenses = lines.filter((line) => line.direction === "expense").reduce((sum, line) => sum + line.amountCents, BigInt(0));
  const detail = (direction: "income" | "expense") => lines.filter(line => line.direction === direction).map(line => [
    { style: 4, value: line.category }, excelDateCell(line.date), { style: 4, value: line.type ?? (direction === "income" ? "Invoice" : "Expense") },
    { style: 4, value: line.name ?? "" }, { style: 4, value: line.property === line.unit ? line.unit : `${line.property} / ${line.unit}` },
    { style: 4, value: line.description }, money(line.amountCents),
  ]);
  const total = (label: string, value: bigint): OwnerWorkbookCell[] => [{ span: 5, value: "" }, { style: 13, value: label }, money(value)];
  const rows: OwnerWorkbookCell[][] = [
    [{ style: 10, span: 4, value: organizationName }, { style: 9, span: 3, value: "PROFIT & LOSS" }],
    [{ style: 10, span: 7, value: report.scopeLabel }],
    [{ span: 5, value: report.periodLabel }, { style: 11, span: 2, value: "Amounts in USD" }],
    [{ style: 4, value: "Accrual basis: income and expenses by invoice or cost date." }],
    [],
    heading("Account", "Date", "Type", "Name", "Property / unit", "Description", "Amount").map((cell, index) => ({ ...cell, style: index === 6 ? 8 : 2 })),
    [{ style: 2, span: 7, value: "INCOME" }],
    ...detail("income"), total("Total income", income),
    [{ style: 2, span: 7, value: "EXPENSES" }],
    ...detail("expense"), total("Total expenses", expenses),
    total("Net operating income", income - expenses),
  ];
  return ownerWorkbookSheetXml(rows, 6, [24, 16, 14, 26, 32, 48, 18]);
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

function ownerStatementStylesXml() {
  return xml(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red](#,##0.00);-"/><numFmt numFmtId="165" formatCode="dd mmm yyyy"/></numFmts>` +
    `<fonts count="4"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FF17324D"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF17324D"/><name val="Aptos"/></font></fonts>` +
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5F7F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F6F9"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><bottom style="thin"><color rgb="FFD6DEE5"/></bottom></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="0" indent="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="0" indent="1"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="164" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" indent="1"/></xf></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
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
      rows.push({
        style: row.isGroup ? 2 : undefined,
        numericValues: row.isGroup ? {} : Object.fromEntries(report.columns.flatMap((column, index) => {
          const value = column.numeric ? row.amounts?.[column.key] : undefined;
          return value !== undefined && /^-?\d+(?:\.\d{1,2})?$/.test(value) ? [[index + (grouped ? 1 : 0), value]] : [];
        })),
        values: [
          ...(grouped ? [row.isGroup ? `Subtotal: ${row.title}` : ""] : []),
          ...report.columns.map(({ key }) => row.cells[key] ?? ""),
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
  rows.push({ values: ["Trace", report.totalsTraceLabel] });
  return rows;
}

function worksheetXml(
  rows: WorkbookRow[],
  headerRow: number,
  lastDataRow: number,
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
      return `<row r="${rowIndex + 1}">${cells}</row>`;
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

function stylesXml() {
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
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
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
