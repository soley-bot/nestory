import { strToU8, zipSync } from "fflate";

import { getReportExportFilename } from "@/features/reports/data/report-format";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import type {
  ReportExportValidation,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

type WorkbookRow = {
  style?: number;
  values: string[];
};

export async function getReportExcel(
  organizationId: string,
  viewQuery: ReportsViewQuery,
): Promise<
  | { body: Uint8Array; filename: string; validation?: never }
  | { body?: never; filename?: never; validation: ReportExportValidation }
> {
  const report = await getTrustedReport({ organizationId, viewQuery });

  if (report.exportValidation) {
    return { validation: report.exportValidation };
  }

  return {
    body: buildTrustedReportXlsx(report),
    filename: getReportExportFilename(report, viewQuery, "xlsx"),
  };
}

export function buildTrustedReportXlsx(report: TrustedReport) {
  const rows = workbookRows(report);
  const headerRow = 6;
  const lastDataRow = Math.max(headerRow, headerRow + report.rows.length);
  const files = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(appPropertiesXml()),
    "docProps/core.xml": strToU8(corePropertiesXml(report)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(stylesXml()),
    "xl/workbook.xml": strToU8(workbookXml()),
    "xl/worksheets/sheet1.xml": strToU8(
      worksheetXml(rows, headerRow, lastDataRow),
    ),
  };

  return zipSync(files, { level: 6 });
}

function workbookRows(report: TrustedReport): WorkbookRow[] {
  const rows: WorkbookRow[] = [
    { style: 1, values: [report.title] },
    { values: ["Scope", report.scopeLabel] },
    { values: ["Period", report.periodLabel] },
    { values: ["Generated", report.generatedAt] },
    { values: [] },
    { style: 2, values: report.columns.map(({ label }) => label) },
  ];

  if (report.rows.length === 0) {
    rows.push({
      values: [report.emptyTitle, report.emptyDescription],
    });
  } else {
    for (const row of report.rows) {
      rows.push({
        values: report.columns.map(({ key }) => row.cells[key] ?? ""),
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
    .map(({ style, values }, rowIndex) => {
      const cells = values
        .map((value, columnIndex) =>
          inlineStringCell(columnIndex, rowIndex, value, style),
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
