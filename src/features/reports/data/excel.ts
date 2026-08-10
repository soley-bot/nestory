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

export function buildOwnerStatementXlsx(model: OwnerStatementPublicationModel) {
  const files = {
    "[Content_Types].xml": strToU8(ownerStatementContentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(ownerStatementAppPropertiesXml()),
    "docProps/core.xml": strToU8(ownerStatementCorePropertiesXml(model)),
    "xl/_rels/workbook.xml.rels": strToU8(ownerStatementWorkbookRelationshipsXml()),
    "xl/styles.xml": strToU8(ownerStatementStylesXml()),
    "xl/workbook.xml": strToU8(ownerStatementWorkbookXml()),
    "xl/worksheets/sheet1.xml": strToU8(ownerStatementSheetXml(model)),
    "xl/worksheets/sheet2.xml": strToU8(ownerStatementSourceSheetXml(model)),
    "xl/worksheets/sheet3.xml": strToU8(ownerStatementChecksSheetXml(model)),
  };
  return zipSync(files, { level: 6 });
}

type OwnerWorkbookCell = {
  style?: number;
  type?: "number" | "text";
  value: string;
};

function ownerStatementSheetXml(model: OwnerStatementPublicationModel) {
  const rows: OwnerWorkbookCell[][] = [
    [{ style: 1, value: "Official Owner Statement" }],
    [{ value: "Statement number" }, { value: model.statementNumber }],
    [{ value: "Period" }, { value: model.monthStart.slice(0, 7) }],
    [{ value: "Currency / units" }, { value: `${model.currency} exact units` }],
    [{ value: "Property ID" }, { value: model.propertyId }],
    [{ value: "Owner ID" }, { value: model.ownerPersonId }],
    [{ value: "Close revision" }, { value: String(model.revisionNumber) }],
    [{ value: "Publication content SHA-256" }, { value: model.contentHash }],
    [],
    [
      { style: 2, value: "Component" },
      { style: 2, value: "Opening" },
      { style: 2, value: "Movement" },
      { style: 2, value: "Closing" },
    ],
    ...model.components.map((component) => [
      { value: component.component },
      { style: 3, type: "number" as const, value: component.openingAmount },
      { style: 3, type: "number" as const, value: component.movementAmount },
      { style: 3, type: "number" as const, value: component.closingAmount },
    ]),
    [],
    [
      { style: 2, value: "Line" },
      { style: 2, value: "Business date" },
      { style: 2, value: "Kind" },
      { style: 2, value: "Component" },
      { style: 2, value: "Description" },
      { style: 2, value: "Amount" },
      { style: 2, value: "Sources" },
    ],
    ...model.lines.map((line) => [
      { type: "number" as const, value: String(line.lineNumber) },
      { value: line.businessDate },
      { value: line.lineKind },
      { value: line.component ?? "activity only" },
      { style: 4, value: line.description },
      { style: 3, type: "number" as const, value: line.signedAmount },
      { type: "number" as const, value: String(line.sourceCount) },
    ]),
  ];
  return ownerWorkbookSheetXml(rows, 14, [32, 42, 18, 30, 52, 16, 10]);
}

function ownerStatementSourceSheetXml(model: OwnerStatementPublicationModel) {
  const rows: OwnerWorkbookCell[][] = [
    [{ style: 1, value: "Owner Statement Source Trace" }],
    [{ value: "Statement number" }, { value: model.statementNumber }],
    [],
    [
      { style: 2, value: "Statement line" },
      { style: 2, value: "Source type" },
      { style: 2, value: "Source ID" },
      { style: 2, value: "Source line ID" },
      { style: 2, value: "Source SHA-256" },
    ],
    ...model.lines.flatMap((line) => line.sources.map((source) => [
      { type: "number" as const, value: String(line.lineNumber) },
      { value: source.sourceType },
      { value: source.sourceId },
      { value: source.sourceLineId },
      { value: source.sourceFingerprint },
    ])),
  ];
  return ownerWorkbookSheetXml(rows, 4, [20, 28, 38, 38, 68]);
}

function ownerStatementChecksSheetXml(model: OwnerStatementPublicationModel) {
  const sourceCount = model.lines.reduce((total, line) => total + line.sourceCount, 0);
  const rows: OwnerWorkbookCell[][] = [
    [{ style: 1, value: "Owner Statement Checks" }],
    [{ value: "Statement number" }, { value: model.statementNumber }],
    [],
    [{ style: 2, value: "Check" }, { style: 2, value: "Actual" }, { style: 2, value: "Expected" }, { style: 2, value: "Status" }],
    [{ value: "Component rows" }, { type: "number", value: String(model.components.length) }, { type: "number", value: "4" }, { value: model.components.length === 4 ? "OK" : "FAIL" }],
    [{ value: "Frozen lines" }, { type: "number", value: String(model.lines.length) }, { type: "number", value: String(model.lines.length) }, { value: "OK" }],
    [{ value: "Frozen source links" }, { type: "number", value: String(sourceCount) }, { type: "number", value: String(sourceCount) }, { value: "OK" }],
    [{ value: "Publication content hash" }, { value: model.contentHash }, { value: "64 lowercase hex" }, { value: /^[0-9a-f]{64}$/.test(model.contentHash) ? "OK" : "FAIL" }],
  ];
  return ownerWorkbookSheetXml(rows, 4, [30, 68, 22, 12]);
}

function ownerWorkbookSheetXml(
  rows: OwnerWorkbookCell[][],
  freezeRow: number,
  widths: number[],
) {
  const rowXml = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = cell.style === undefined ? "" : ` s="${cell.style}"`;
      if (cell.type === "number") {
        return `<c r="${ref}"${style}><v>${escapeXml(cell.value)}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    }).join("")}</row>`,
  ).join("");
  const columns = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("");
  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols>` +
    `<sheetData>${rowXml}</sheetData></worksheet>`,
  );
}

function ownerStatementContentTypesXml() {
  return xml(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    [1, 2, 3].map((number) => `<Override PartName="/xl/worksheets/sheet${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `</Types>`,
  );
}

function ownerStatementWorkbookXml() {
  return xml(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Statement" sheetId="1" r:id="rId1"/><sheet name="Source Trace" sheetId="2" r:id="rId2"/><sheet name="Checks" sheetId="3" r:id="rId3"/></sheets></workbook>`,
  );
}

function ownerStatementWorkbookRelationshipsXml() {
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    [1, 2, 3].map((number) => `<Relationship Id="rId${number}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${number}.xml"/>`).join("") +
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
}

function ownerStatementStylesXml() {
  return xml(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red](#,##0.00);-"/></numFmts>` +
    `<fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FF17324D"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5F7F"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><bottom style="thin"><color rgb="FFD6DEE5"/></bottom></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
}

function ownerStatementCorePropertiesXml(model: OwnerStatementPublicationModel) {
  const generatedAt = escapeXml(model.generatedAt);
  return xml(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(model.statementNumber)}</dc:title><dc:creator>Nestory</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:modified></cp:coreProperties>`,
  );
}

function ownerStatementAppPropertiesXml() {
  return xml(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Nestory</Application><TitlesOfParts><vt:vector size="3" baseType="lpstr"><vt:lpstr>Statement</vt:lpstr><vt:lpstr>Source Trace</vt:lpstr><vt:lpstr>Checks</vt:lpstr></vt:vector></TitlesOfParts></Properties>`);
}

function workbookRows(report: TrustedReport): WorkbookRow[] {
  const rows: WorkbookRow[] = [
    { style: 1, values: [report.title] },
    { values: ["Scope", report.scopeLabel] },
    { values: ["Period", report.periodLabel] },
    { values: ["Generated", report.generatedAt] },
    { values: [] },
    {
      style: 2,
      values: [
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
        values: [
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
