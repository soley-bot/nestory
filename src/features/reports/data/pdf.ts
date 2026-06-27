import { getReportsScreenData } from "@/features/reports/data/reports";
import {
  formatLongReportDate,
  getReportScopeLabel,
  slugifyReportPart,
} from "@/features/reports/data/report-format";
import type {
  OccupancyReport,
  OccupancyReportRow,
  ReportsViewQuery,
} from "@/features/reports/reports.types";

type PdfExport = {
  body: Uint8Array;
  filename: string;
};

type PdfPage = {
  rows: PdfTableRow[];
};

type PdfTableRow = {
  cells: string[];
  height: number;
  index: number;
  lines: string[][];
};

type PdfColumn = {
  align?: "center" | "left" | "right";
  label: string;
  maxLines?: number;
  width: number;
};

type DrawTextOptions = {
  align?: "center" | "left" | "right";
  bold?: boolean;
  color?: string;
  fontSize?: number;
  width?: number;
};

const pageWidth = 842;
const pageHeight = 595;
const marginX = 36;
const tableWidth = 770;
const rowFontSize = 8.2;
const rowLineHeight = 10.4;
const cellPaddingX = 5;
const tableTopY = 454;
const tableBottomY = 45;
const headerRowHeight = 24;

const colors = {
  accent: "#2f5f7f",
  border: "#cbd5df",
  headerFill: "#edf3f8",
  ink: "#17212b",
  muted: "#5d6b78",
  rowAlt: "#f8fafc",
  rowFill: "#ffffff",
  soft: "#f3f6f9",
  warning: "#ad5700",
};

const columns: PdfColumn[] = [
  { align: "center", label: "No.", maxLines: 1, width: 30 },
  { label: "Property Name", maxLines: 2, width: 168 },
  { label: "Unit no. / Floor", maxLines: 2, width: 92 },
  { label: "Type", maxLines: 2, width: 72 },
  { label: "Inclusion", maxLines: 2, width: 70 },
  { align: "right", label: "Price", maxLines: 1, width: 86 },
  { label: "Property Code", maxLines: 2, width: 72 },
  { label: "Remark", maxLines: 3, width: 180 },
];

export async function getReportPdf(
  organizationId: string,
  organizationName: string,
  viewQuery: ReportsViewQuery,
): Promise<PdfExport> {
  if (viewQuery.report !== "occupancy") {
    throw new Error("PDF export is only available for occupancy reports.");
  }

  const data = await getReportsScreenData(organizationId, viewQuery);
  const report = data.occupancyReport;
  const scopeLabel = getReportScopeLabel(viewQuery.propertyId, data.propertyOptions);
  const filenameScope =
    viewQuery.propertyId === "all"
      ? "all-properties"
      : slugifyReportPart(scopeLabel);

  return {
    body: buildOccupancyReportPdf({
      organizationName,
      report,
      scopeLabel,
    }),
    filename:
      viewQuery.status === "vacant"
        ? `available-units-${filenameScope}.pdf`
        : `occupancy-report-${filenameScope}.pdf`,
  };
}

export function buildOccupancyReportPdf({
  organizationName,
  report,
  scopeLabel,
}: {
  organizationName: string;
  report?: OccupancyReport;
  scopeLabel: string;
}) {
  const rows = buildPdfRows(report?.rows ?? []);
  const pages = paginateRows(rows);
  const pageCommands = pages.map((page, pageIndex) =>
    renderPage({
      organizationName,
      page,
      pageIndex,
      report,
      scopeLabel,
      totalPages: pages.length,
    }),
  );

  return createPdfDocument(pageCommands);
}

function buildPdfRows(rows: OccupancyReportRow[]) {
  if (rows.length === 0) {
    return [
      buildPdfRow(
        [
          "",
          "No units match this report.",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        0,
      ),
    ];
  }

  return rows.map((row, index) =>
    buildPdfRow(
      [
        String(index + 1),
        row.propertyName,
        getUnitFloorLabel(row),
        row.typeLabel,
        row.inclusionLabel,
        row.rentLabel,
        row.propertyCode,
        row.remark,
      ],
      index,
    ),
  );
}

function buildPdfRow(cells: string[], index: number): PdfTableRow {
  const lines = cells.map((cell, cellIndex) =>
    wrapText(
      cell,
      columns[cellIndex].width - cellPaddingX * 2,
      rowFontSize,
      columns[cellIndex].maxLines ?? 2,
    ),
  );
  const lineCount = Math.max(...lines.map((cellLines) => cellLines.length), 1);

  return {
    cells,
    height: Math.max(22, lineCount * rowLineHeight + 9),
    index,
    lines,
  };
}

function paginateRows(rows: PdfTableRow[]) {
  const pages: PdfPage[] = [];
  let currentRows: PdfTableRow[] = [];
  let remainingHeight = tableTopY - headerRowHeight - tableBottomY;

  for (const row of rows) {
    if (currentRows.length > 0 && row.height > remainingHeight) {
      pages.push({ rows: currentRows });
      currentRows = [];
      remainingHeight = tableTopY - headerRowHeight - tableBottomY;
    }

    currentRows.push(row);
    remainingHeight -= row.height;
  }

  pages.push({ rows: currentRows });

  return pages;
}

function renderPage({
  organizationName,
  page,
  pageIndex,
  report,
  scopeLabel,
  totalPages,
}: {
  organizationName: string;
  page: PdfPage;
  pageIndex: number;
  report?: OccupancyReport;
  scopeLabel: string;
  totalPages: number;
}) {
  const commands: string[] = [];
  const pageNumber = pageIndex + 1;

  drawHeader(commands, organizationName, report, scopeLabel);
  drawTableHeader(commands, tableTopY);

  let y = tableTopY - headerRowHeight;

  for (const row of page.rows) {
    y -= row.height;
    drawTableRow(commands, row, y);
  }

  drawFooter(commands, pageNumber, totalPages);

  return commands.join("\n");
}

function drawHeader(
  commands: string[],
  organizationName: string,
  report: OccupancyReport | undefined,
  scopeLabel: string,
) {
  drawRect(commands, marginX, 542, 28, 28, {
    fill: colors.ink,
    stroke: colors.ink,
  });
  drawText(commands, "N", marginX, 551, {
    align: "center",
    bold: true,
    color: "#ffffff",
    fontSize: 13,
    width: 28,
  });
  drawText(commands, "Nestory", marginX + 38, 557, {
    bold: true,
    color: colors.ink,
    fontSize: 11,
  });
  drawText(commands, "Available unit report", marginX + 38, 544, {
    color: colors.muted,
    fontSize: 8.5,
  });

  drawText(commands, `Available Units - ${organizationName}`, 0, 550, {
    align: "center",
    bold: true,
    color: colors.ink,
    fontSize: 16,
    width: pageWidth,
  });
  drawText(
    commands,
    report ? `(Last Update: ${formatLongReportDate(report.generatedAt)})` : "",
    0,
    532,
    {
      align: "center",
      color: colors.muted,
      fontSize: 9.5,
      width: pageWidth,
    },
  );

  drawText(commands, "STRICTLY FOR LEASING REVIEW", pageWidth - marginX - 160, 557, {
    align: "right",
    bold: true,
    color: colors.warning,
    fontSize: 8,
    width: 160,
  });
  drawText(commands, `Page prepared ${formatLongReportDate(new Date().toISOString())}`, pageWidth - marginX - 190, 544, {
    align: "right",
    color: colors.muted,
    fontSize: 8,
    width: 190,
  });

  drawRect(commands, marginX, 492, tableWidth, 30, {
    fill: colors.soft,
    stroke: colors.border,
  });
  drawRect(commands, marginX, 492, 4, 30, { fill: colors.accent });
  drawMeta(commands, "Scope", scopeLabel, marginX + 16, 501, 250);
  drawMeta(
    commands,
    "Report rows",
    String(report?.totals.visible ?? 0),
    marginX + 300,
    501,
    115,
  );
  drawMeta(
    commands,
    "Vacant units",
    String(report?.totals.vacant ?? 0),
    marginX + 448,
    501,
    115,
  );
  drawMeta(
    commands,
    "Template",
    "IPS available units",
    marginX + 594,
    501,
    150,
  );
}

function drawMeta(
  commands: string[],
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  drawText(commands, label.toUpperCase(), x, y + 10, {
    bold: true,
    color: colors.muted,
    fontSize: 6.8,
    width,
  });
  drawText(commands, value, x, y - 1, {
    bold: true,
    color: colors.ink,
    fontSize: 9,
    width,
  });
}

function drawTableHeader(commands: string[], yTop: number) {
  drawRect(commands, marginX, yTop - headerRowHeight, tableWidth, headerRowHeight, {
    fill: colors.headerFill,
    stroke: colors.border,
  });

  let x = marginX;

  for (const column of columns) {
    drawLine(commands, x, yTop - headerRowHeight, x, yTop, colors.border, 0.6);
    drawText(commands, column.label, x + cellPaddingX, yTop - 15, {
      align: column.align,
      bold: true,
      color: colors.ink,
      fontSize: 7.6,
      width: column.width - cellPaddingX * 2,
    });
    x += column.width;
  }

  drawLine(commands, marginX + tableWidth, yTop - headerRowHeight, marginX + tableWidth, yTop, colors.border, 0.6);
}

function drawTableRow(commands: string[], row: PdfTableRow, y: number) {
  const fill = row.index % 2 === 0 ? colors.rowFill : colors.rowAlt;
  drawRect(commands, marginX, y, tableWidth, row.height, {
    fill,
    stroke: colors.border,
  });

  let x = marginX;

  for (const [cellIndex, column] of columns.entries()) {
    drawLine(commands, x, y, x, y + row.height, colors.border, 0.4);
    drawCellText(commands, row.lines[cellIndex], x, y, column, row.height);
    x += column.width;
  }

  drawLine(commands, marginX + tableWidth, y, marginX + tableWidth, y + row.height, colors.border, 0.4);
}

function drawCellText(
  commands: string[],
  lines: string[],
  x: number,
  y: number,
  column: PdfColumn,
  height: number,
) {
  let textY = y + height - 8 - rowFontSize;
  const textWidthLimit = column.width - cellPaddingX * 2;

  for (const line of lines) {
    drawText(commands, line, x + cellPaddingX, textY, {
      align: column.align,
      color: colors.ink,
      fontSize: rowFontSize,
      width: textWidthLimit,
    });
    textY -= rowLineHeight;
  }
}

function drawFooter(commands: string[], pageNumber: number, totalPages: number) {
  drawLine(commands, marginX, 30, marginX + tableWidth, 30, colors.border, 0.6);
  drawText(commands, "Nestory property report", marginX, 18, {
    color: colors.muted,
    fontSize: 8,
  });
  drawText(commands, `Page ${pageNumber} of ${totalPages}`, marginX, 18, {
    align: "right",
    color: colors.muted,
    fontSize: 8,
    width: tableWidth,
  });
}

function drawRect(
  commands: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: string; lineWidth?: number; stroke?: string },
) {
  commands.push(`${options.lineWidth ?? 0.5} w`);

  if (options.fill) {
    commands.push(`${toRgb(options.fill)} rg`);
  }

  if (options.stroke) {
    commands.push(`${toRgb(options.stroke)} RG`);
  }

  commands.push(`${round(x)} ${round(y)} ${round(width)} ${round(height)} re`);

  if (options.fill && options.stroke) {
    commands.push("B");
  } else if (options.fill) {
    commands.push("f");
  } else {
    commands.push("S");
  }
}

function drawLine(
  commands: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 0.5,
) {
  commands.push(`${width} w`);
  commands.push(`${toRgb(color)} RG`);
  commands.push(`${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`);
}

function drawText(
  commands: string[],
  value: string,
  x: number,
  y: number,
  options: DrawTextOptions = {},
) {
  const fontSize = options.fontSize ?? 9;
  const font = options.bold ? "F2" : "F1";
  const width = options.width ?? 0;
  const text = sanitizeText(value);
  const offset =
    options.align === "right"
      ? Math.max(0, width - estimateTextWidth(text, fontSize, options.bold))
      : options.align === "center"
        ? Math.max(0, (width - estimateTextWidth(text, fontSize, options.bold)) / 2)
        : 0;

  commands.push(`${toRgb(options.color ?? colors.ink)} rg`);
  commands.push(
    `BT /${font} ${fontSize} Tf 1 0 0 1 ${round(x + offset)} ${round(y)} Tm (${escapePdfString(
      text,
    )}) Tj ET`,
  );
}

function wrapText(
  value: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
) {
  const words = sanitizeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words.length > 0 ? words : ["-"]) {
    const candidate = current ? `${current} ${word}` : word;

    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (estimateTextWidth(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }

    const chunkSize = Math.max(4, Math.floor(maxWidth / (fontSize * 0.56)));
    for (let index = 0; index < word.length; index += chunkSize) {
      lines.push(word.slice(index, index + chunkSize));
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  trimmed[trimmed.length - 1] = `${trimmed[trimmed.length - 1].replace(/\.*$/, "")}...`;

  return trimmed;
}

function estimateTextWidth(value: string, fontSize: number, bold = false) {
  let units = 0;

  for (const char of value) {
    if (char === " ") {
      units += 0.32;
    } else if (/[il.,'|]/.test(char)) {
      units += 0.28;
    } else if (/[mwMW@#%]/.test(char)) {
      units += 0.82;
    } else if (/[A-Z0-9]/.test(char)) {
      units += 0.58;
    } else {
      units += 0.5;
    }
  }

  return units * fontSize * (bold ? 1.04 : 1);
}

function createPdfDocument(pageContents: string[]) {
  const maxObjectId = 4 + pageContents.length * 2;
  const objects: string[] = new Array(maxObjectId + 1);
  const pageRefs = pageContents
    .map((_, index) => `${5 + index * 2} 0 R`)
    .join(" ");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageContents.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pageContents.forEach((content, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const contentLength = Buffer.byteLength(content, "latin1");

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(pdf, "latin1");
    pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${maxObjectId + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

function getUnitFloorLabel(row: OccupancyReportRow) {
  return row.floorLabel === "-" ? row.unitNumber : `${row.unitNumber} / ${row.floorLabel}`;
}

function sanitizeText(value: string) {
  const sanitized = value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "-";
}

function escapePdfString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toRgb(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  return `${round(red)} ${round(green)} ${round(blue)}`;
}

function round(value: number) {
  return Number(value.toFixed(3));
}
