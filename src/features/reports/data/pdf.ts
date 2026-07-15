import { getTrustedReport } from "@/features/reports/data/trusted-report";
import {
  formatLongReportDate,
  slugifyReportPart,
} from "@/features/reports/data/report-format";
import type {
  OccupancyReport,
  OccupancyReportRow,
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
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
  fill?: string;
  fontSize?: number;
  height: number;
  index: number;
  isBold?: boolean;
  lineHeight?: number;
  lines: string[][];
  textColor?: string;
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

type BuildPdfRowOptions = Pick<
  PdfTableRow,
  "fill" | "fontSize" | "isBold" | "lineHeight" | "textColor"
> & {
  minHeight?: number;
  verticalPadding?: number;
};

type IncomeExpenseStatementEntry = {
  amount: number;
  category: string;
  currency: string;
  date: string;
  description: string;
  direction: "Expense" | "Income";
  name: string;
  property: string;
};

type OwnerStatementPdfBlock = {
  height: number;
  kind: "blocked" | "empty" | "ready";
  row?: TrustedReportRow;
};

type OwnerStatementPdfPage = {
  blocks: OwnerStatementPdfBlock[];
};

type OwnerStatementMoneyMetric = {
  key: string;
  label: string;
};

const pageWidth = 842;
const pageHeight = 595;
const marginX = 36;
const tableWidth = 770;
const rowFontSize = 8.2;
const rowLineHeight = 10.4;
const cellPaddingX = 5;
const tableTopY = 382;
const statementTableTopY = 438;
const tableBottomY = 45;
const headerRowHeight = 24;
const ownerStatementBlockGap = 10;
const ownerStatementIdentityHeight = 32;
const ownerStatementMoneyRowHeight = 48;

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

const statementColumns: PdfColumn[] = [
  { label: "Date", maxLines: 1, width: 92 },
  { label: "Type", maxLines: 1, width: 70 },
  { label: "Name / Record", maxLines: 2, width: 142 },
  { label: "Property", maxLines: 2, width: 160 },
  { align: "right", label: "Amount", maxLines: 1, width: 96 },
  { label: "Description", maxLines: 2, width: 210 },
];

const ownerStatementMoneyRows: OwnerStatementMoneyMetric[][] = [
  [
    { key: "operatingCash", label: "Operating cash received" },
    { key: "propertyExpenses", label: "Property expenses paid" },
    { key: "managementReceived", label: "Management fees received" },
    { key: "netMovement", label: "Net owner cash movement" },
  ],
  [
    { key: "managementEarned", label: "Management fees earned" },
    {
      key: "managementOutstanding",
      label: "Management fees outstanding from this period",
    },
    { key: "ownerContributions", label: "Owner contributions" },
    { key: "ownerPayouts", label: "Owner payouts" },
    { key: "depositsHeld", label: "Security deposits held" },
  ],
];

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
  const report = await getTrustedReport({
    organizationId,
    viewQuery,
  });

  return {
    body: buildTrustedReportPdf({ organizationName, report }),
    filename: `${report.exportFilenameBase}-${viewQuery.month}-${slugifyReportPart(
      report.scopeLabel,
    )}.pdf`,
  };
}

export function buildTrustedReportPdf({
  organizationName,
  report,
}: {
  organizationName: string;
  report: TrustedReport;
}) {
  if (report.kind === "income-expense") {
    return buildIncomeExpenseStatementPdf({ organizationName, report });
  }
  if (report.kind === "owner-statement") {
    return buildOwnerStatementPdf({ organizationName, report });
  }

  const reportColumns = buildTrustedReportPdfColumns(report);
  const rows = buildTrustedReportPdfRows(report, reportColumns);
  const pages = paginateRows(rows);
  const pageCommands = pages.map((page, pageIndex) =>
    renderTrustedReportPage({
      organizationName,
      page,
      pageIndex,
      report,
      reportColumns,
      totalPages: pages.length,
    }),
  );

  return createPdfDocument(pageCommands);
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
        columns,
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
      columns,
    ),
  );
}

function buildPdfRow(
  cells: string[],
  index: number,
  pdfColumns: PdfColumn[],
  options: BuildPdfRowOptions = {},
): PdfTableRow {
  const fontSize = options.fontSize ?? rowFontSize;
  const lineHeight = options.lineHeight ?? rowLineHeight;
  const lines = cells.map((cell, cellIndex) =>
    wrapText(
      cell,
      pdfColumns[cellIndex].width - cellPaddingX * 2,
      fontSize,
      pdfColumns[cellIndex].maxLines ?? 2,
    ),
  );
  const lineCount = Math.max(...lines.map((cellLines) => cellLines.length), 1);

  return {
    cells,
    fill: options.fill,
    fontSize,
    height: Math.max(
      options.minHeight ?? 22,
      lineCount * lineHeight + (options.verticalPadding ?? 9),
    ),
    index,
    isBold: options.isBold,
    lineHeight,
    lines,
    textColor: options.textColor,
  };
}

function paginateRows(rows: PdfTableRow[], yTop = tableTopY) {
  const pages: PdfPage[] = [];
  let currentRows: PdfTableRow[] = [];
  let remainingHeight = yTop - headerRowHeight - tableBottomY;

  for (const row of rows) {
    if (currentRows.length > 0 && row.height > remainingHeight) {
      pages.push({ rows: currentRows });
      currentRows = [];
      remainingHeight = yTop - headerRowHeight - tableBottomY;
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
  drawTableHeader(commands, tableTopY, columns);

  let y = tableTopY - headerRowHeight;

  for (const row of page.rows) {
    y -= row.height;
    drawTableRow(commands, row, y, columns);
  }

  drawFooter(commands, pageNumber, totalPages);

  return commands.join("\n");
}

function buildTrustedReportPdfColumns(report: TrustedReport): PdfColumn[] {
  const sourceWidth = 74;
  const recordWidth = 164;
  const dataWidth = Math.floor(
    (tableWidth - sourceWidth - recordWidth) / Math.max(1, report.columns.length),
  );

  return [
    { label: "Record", maxLines: 3, width: recordWidth },
    ...report.columns.map((column) => ({
      align: column.align,
      label: column.label,
      maxLines: column.align === "right" ? 1 : 2,
      width: dataWidth,
    })),
    { align: "right", label: "Sources", maxLines: 1, width: sourceWidth },
  ];
}

function buildTrustedReportPdfRows(
  report: TrustedReport,
  reportColumns: PdfColumn[],
) {
  if (report.rows.length === 0) {
    return [
      buildPdfRow(
        [
          report.emptyTitle,
          ...report.columns.map((_, index) =>
            index === 0 ? report.emptyDescription : "",
          ),
          "",
        ],
        0,
        reportColumns,
      ),
    ];
  }

  return report.rows.map((row, index) =>
    buildPdfRow(
      [
        row.title,
        ...report.columns.map((column) => row.cells[column.key] ?? "-"),
        String(row.sourceCount),
      ],
      index,
      reportColumns,
    ),
  );
}

function renderTrustedReportPage({
  organizationName,
  page,
  pageIndex,
  report,
  reportColumns,
  totalPages,
}: {
  organizationName: string;
  page: PdfPage;
  pageIndex: number;
  report: TrustedReport;
  reportColumns: PdfColumn[];
  totalPages: number;
}) {
  const commands: string[] = [];
  const pageNumber = pageIndex + 1;

  drawTrustedReportHeader(commands, organizationName, report);
  drawTableHeader(commands, tableTopY, reportColumns);

  let y = tableTopY - headerRowHeight;

  for (const row of page.rows) {
    y -= row.height;
    drawTableRow(commands, row, y, reportColumns);
  }

  drawFooter(commands, pageNumber, totalPages);

  return commands.join("\n");
}

function buildOwnerStatementPdf({
  organizationName,
  report,
}: {
  organizationName: string;
  report: TrustedReport;
}) {
  const blocks = buildOwnerStatementPdfBlocks(report);
  const pages = paginateOwnerStatementBlocks(blocks);
  const pageCommands = pages.map((page, pageIndex) =>
    renderOwnerStatementPage({
      organizationName,
      page,
      pageIndex,
      report,
      totalPages: pages.length,
    }),
  );

  return createPdfDocument(pageCommands);
}

function buildOwnerStatementPdfBlocks(
  report: TrustedReport,
): OwnerStatementPdfBlock[] {
  if (report.rows.length === 0) {
    return [{ height: 64, kind: "empty" }];
  }

  return report.rows.map((row) => ({
    height: getOwnerStatementBlockHeight(row),
    kind: isBlockedOwnerStatementRow(row) ? "blocked" : "ready",
    row,
  }));
}

function getOwnerStatementBlockHeight(row: TrustedReportRow) {
  if (isBlockedOwnerStatementRow(row)) {
    const reasonLines = ownerStatementTextLines(
      ownerStatementBlockerReason(row),
      tableWidth - 20,
      8.5,
    );
    return ownerStatementIdentityHeight + 44 + reasonLines.length * 10.5;
  }

  const noteLines = ownerStatementTextLines(
    ownerStatementNotes(row),
    tableWidth - 190,
    8.2,
  );
  const supportHeight = Math.max(28, 18 + noteLines.length * 10);
  return (
    ownerStatementIdentityHeight +
    ownerStatementMoneyRowHeight * ownerStatementMoneyRows.length +
    supportHeight
  );
}

function paginateOwnerStatementBlocks(blocks: OwnerStatementPdfBlock[]) {
  const pages: OwnerStatementPdfPage[] = [];
  let currentBlocks: OwnerStatementPdfBlock[] = [];
  let remainingHeight = tableTopY - tableBottomY;

  for (const block of blocks) {
    const gap = currentBlocks.length > 0 ? ownerStatementBlockGap : 0;
    if (
      currentBlocks.length > 0 &&
      block.height + gap > remainingHeight
    ) {
      pages.push({ blocks: currentBlocks });
      currentBlocks = [];
      remainingHeight = tableTopY - tableBottomY;
    }

    const appliedGap = currentBlocks.length > 0 ? ownerStatementBlockGap : 0;
    currentBlocks.push(block);
    remainingHeight -= block.height + appliedGap;
  }

  pages.push({ blocks: currentBlocks });
  return pages;
}

function renderOwnerStatementPage({
  organizationName,
  page,
  pageIndex,
  report,
  totalPages,
}: {
  organizationName: string;
  page: OwnerStatementPdfPage;
  pageIndex: number;
  report: TrustedReport;
  totalPages: number;
}) {
  const commands: string[] = [];
  const pageNumber = pageIndex + 1;
  let yTop = tableTopY;

  drawTrustedReportHeader(commands, organizationName, report);

  for (const [index, block] of page.blocks.entries()) {
    if (index > 0) yTop -= ownerStatementBlockGap;
    drawOwnerStatementBlock(commands, block, report, yTop);
    yTop -= block.height;
  }

  drawFooter(commands, pageNumber, totalPages);
  return commands.join("\n");
}

function drawOwnerStatementBlock(
  commands: string[],
  block: OwnerStatementPdfBlock,
  report: TrustedReport,
  yTop: number,
) {
  if (block.kind === "empty") {
    drawOwnerStatementEmptyBlock(commands, report, yTop, block.height);
    return;
  }

  const row = block.row!;
  if (block.kind === "blocked") {
    drawBlockedOwnerStatement(commands, row, yTop, block.height);
    return;
  }

  drawReadyOwnerStatement(commands, row, yTop, block.height);
}

function drawReadyOwnerStatement(
  commands: string[],
  row: TrustedReportRow,
  yTop: number,
  height: number,
) {
  const yBottom = yTop - height;
  drawRect(commands, marginX, yBottom, tableWidth, height, {
    fill: colors.rowFill,
    stroke: colors.border,
  });
  drawRect(
    commands,
    marginX,
    yTop - ownerStatementIdentityHeight,
    tableWidth,
    ownerStatementIdentityHeight,
    { fill: colors.soft, stroke: colors.border },
  );

  drawMeta(commands, "Owner", row.cells.owner ?? "-", marginX + 10, yTop - 22, 190);
  drawMeta(
    commands,
    "Property",
    row.cells.property ?? "-",
    marginX + 210,
    yTop - 22,
    250,
  );
  drawMeta(
    commands,
    "Status",
    row.cells.readiness ?? "Ready",
    marginX + 470,
    yTop - 22,
    160,
  );
  drawMeta(
    commands,
    "Ownership share",
    row.cells.ownership ?? "-",
    marginX + 640,
    yTop - 22,
    120,
  );

  let moneyRowTop = yTop - ownerStatementIdentityHeight;
  for (const metrics of ownerStatementMoneyRows) {
    drawOwnerStatementMoneyRow(commands, row, moneyRowTop, metrics);
    moneyRowTop -= ownerStatementMoneyRowHeight;
  }

  drawOwnerStatementSupportLine(commands, row, moneyRowTop, yBottom);
}

function drawOwnerStatementMoneyRow(
  commands: string[],
  row: TrustedReportRow,
  yTop: number,
  metrics: OwnerStatementMoneyMetric[],
) {
  const gap = 8;
  const cellWidth = (tableWidth - gap * (metrics.length - 1)) / metrics.length;
  const yBottom = yTop - ownerStatementMoneyRowHeight;

  for (const [index, metric] of metrics.entries()) {
    const x = marginX + index * (cellWidth + gap);
    drawRect(commands, x, yBottom, cellWidth, ownerStatementMoneyRowHeight, {
      fill: colors.rowFill,
      stroke: colors.border,
    });
    const labelLines = wrapText(metric.label, cellWidth - 16, 6.5, 3);
    labelLines.forEach((line, lineIndex) => {
      drawText(commands, line, x + 8, yTop - 12 - lineIndex * 7.2, {
        bold: true,
        color: colors.muted,
        fontSize: 6.5,
        width: cellWidth - 16,
      });
    });
    drawText(commands, row.cells[metric.key] ?? "-", x + 8, yBottom + 8, {
      align: "right",
      bold: true,
      color: colors.ink,
      fontSize: 10,
      width: cellWidth - 16,
    });
  }
}

function drawOwnerStatementSupportLine(
  commands: string[],
  row: TrustedReportRow,
  yTop: number,
  yBottom: number,
) {
  const noteWidth = tableWidth - 190;
  drawRect(commands, marginX, yBottom, tableWidth, yTop - yBottom, {
    fill: row.tone === "warning" ? "#fffaf0" : colors.rowFill,
    stroke: colors.border,
  });
  drawText(commands, "NOTES / WARNINGS", marginX + 10, yTop - 11, {
    bold: true,
    color: colors.muted,
    fontSize: 6.8,
    width: noteWidth,
  });
  const noteLines = ownerStatementTextLines(
    ownerStatementNotes(row),
    noteWidth,
    8.2,
  );
  noteLines.forEach((line, index) => {
    drawText(commands, line, marginX + 10, yTop - 23 - index * 10, {
      color: colors.ink,
      fontSize: 8.2,
      width: noteWidth,
    });
  });
  drawText(commands, "EVIDENCE / SOURCES", marginX + tableWidth - 160, yTop - 11, {
    align: "right",
    bold: true,
    color: colors.muted,
    fontSize: 6.8,
    width: 150,
  });
  drawText(commands, row.sourceSummary, marginX + tableWidth - 160, yTop - 23, {
    align: "right",
    color: colors.ink,
    fontSize: 8.2,
    width: 150,
  });
}

function drawBlockedOwnerStatement(
  commands: string[],
  row: TrustedReportRow,
  yTop: number,
  height: number,
) {
  const yBottom = yTop - height;
  drawRect(commands, marginX, yBottom, tableWidth, height, {
    fill: "#fffaf0",
    stroke: colors.warning,
  });
  drawRect(
    commands,
    marginX,
    yTop - ownerStatementIdentityHeight,
    tableWidth,
    ownerStatementIdentityHeight,
    { fill: "#fff4df", stroke: colors.warning },
  );
  drawMeta(
    commands,
    "Property",
    row.cells.property ?? "-",
    marginX + 10,
    yTop - 22,
    520,
  );
  drawMeta(commands, "Status", "Blocked", marginX + 550, yTop - 22, 210);

  const bodyTop = yTop - ownerStatementIdentityHeight;
  drawText(commands, "BLOCKER REASONS", marginX + 10, bodyTop - 14, {
    bold: true,
    color: colors.warning,
    fontSize: 6.8,
    width: tableWidth - 20,
  });
  const reasonLines = ownerStatementTextLines(
    ownerStatementBlockerReason(row),
    tableWidth - 20,
    8.5,
  );
  reasonLines.forEach((line, index) => {
    drawText(commands, line, marginX + 10, bodyTop - 28 - index * 10.5, {
      color: colors.ink,
      fontSize: 8.5,
      width: tableWidth - 20,
    });
  });
  drawText(commands, row.sourceSummary, marginX + 10, yBottom + 9, {
    color: colors.muted,
    fontSize: 7.8,
    width: tableWidth - 20,
  });
}

function drawOwnerStatementEmptyBlock(
  commands: string[],
  report: TrustedReport,
  yTop: number,
  height: number,
) {
  const yBottom = yTop - height;
  drawRect(commands, marginX, yBottom, tableWidth, height, {
    fill: colors.rowFill,
    stroke: colors.border,
  });
  drawText(commands, report.emptyTitle, marginX + 12, yTop - 24, {
    bold: true,
    color: colors.ink,
    fontSize: 11,
    width: tableWidth - 24,
  });
  drawText(commands, report.emptyDescription, marginX + 12, yTop - 43, {
    color: colors.muted,
    fontSize: 8.5,
    width: tableWidth - 24,
  });
}

function isBlockedOwnerStatementRow(row: TrustedReportRow) {
  return row.cells.readiness === "Blocked";
}

function ownerStatementBlockerReason(row: TrustedReportRow) {
  return row.cells.notes?.trim() || row.title;
}

function ownerStatementNotes(row: TrustedReportRow) {
  const notes = row.cells.notes?.trim();
  return notes && !/^[\u2010-\u2015-]+$/.test(notes) ? notes : "No warnings";
}

function ownerStatementTextLines(
  value: string,
  maxWidth: number,
  fontSize: number,
) {
  return wrapText(value, maxWidth, fontSize, 100);
}

function buildIncomeExpenseStatementPdf({
  organizationName,
  report,
}: {
  organizationName: string;
  report: TrustedReport;
}) {
  const rows = buildIncomeExpenseStatementRows(report);
  const pages = paginateRows(rows, statementTableTopY);
  const pageCommands = pages.map((page, pageIndex) =>
    renderIncomeExpenseStatementPage({
      organizationName,
      page,
      pageIndex,
      report,
      totalPages: pages.length,
    }),
  );

  return createPdfDocument(pageCommands);
}

function buildIncomeExpenseStatementRows(report: TrustedReport) {
  const entries = report.rows
    .map(toIncomeExpenseStatementEntry)
    .filter((entry): entry is IncomeExpenseStatementEntry => Boolean(entry));
  const currency = entries[0]?.currency ?? "USD";
  const rows: PdfTableRow[] = [];

  if (entries.length === 0) {
    return [
      buildPdfRow(
        [report.emptyTitle, "", "", "", "", report.emptyDescription],
        0,
        statementColumns,
      ),
    ];
  }

  let rowIndex = 0;
  const incomeEntries = entries.filter((entry) => entry.direction === "Income");
  const expenseEntries = entries.filter((entry) => entry.direction === "Expense");
  const incomeTotal = sumStatementEntries(incomeEntries);
  const expenseTotal = sumStatementEntries(expenseEntries);

  rowIndex = appendStatementSectionRows(rows, rowIndex, {
    entries: incomeEntries,
    sectionLabel: "Income",
    totalLabel: "Total Income",
  });
  rowIndex = appendStatementSectionRows(rows, rowIndex, {
    entries: expenseEntries,
    sectionLabel: "Expenses",
    totalLabel: "Total Expenses",
  });

  rows.push(
    buildStatementTotalRow(
      "Net operating income",
      formatStatementMoney(incomeTotal - expenseTotal, currency),
      rowIndex++,
    ),
    buildStatementTotalRow("Other income", formatStatementMoney(0, currency), rowIndex++),
    buildStatementTotalRow("Other expenses", formatStatementMoney(0, currency), rowIndex++),
    buildStatementTotalRow("Net other income", formatStatementMoney(0, currency), rowIndex++),
    buildStatementTotalRow(
      "Net income",
      formatStatementMoney(incomeTotal - expenseTotal, currency),
      rowIndex++,
    ),
  );

  return rows;
}

function appendStatementSectionRows(
  rows: PdfTableRow[],
  startIndex: number,
  {
    entries,
    sectionLabel,
    totalLabel,
  }: {
    entries: IncomeExpenseStatementEntry[];
    sectionLabel: string;
    totalLabel: string;
  },
) {
  let rowIndex = startIndex;
  const compactRow = {
    fontSize: 7.8,
    lineHeight: 8.6,
    minHeight: 16,
    verticalPadding: 6,
  } satisfies BuildPdfRowOptions;

  rows.push(
    buildPdfRow(
      [sectionLabel, "", "", "", "", ""],
      rowIndex++,
      statementColumns,
      {
        fill: "#e9eef6",
        fontSize: 8.6,
        isBold: true,
        lineHeight: 8.8,
        minHeight: 16,
        verticalPadding: 6,
      },
    ),
  );

  for (const [categoryKey, categoryEntries] of groupStatementEntries(entries)) {
    const category = categoryKey.split("::")[0] ?? "Uncategorized";
    rows.push(
      buildPdfRow(
        ["", "", category, "", "", ""],
        rowIndex++,
        statementColumns,
        {
          ...compactRow,
          fontSize: 8.1,
          isBold: true,
        },
      ),
    );

    for (const entry of categoryEntries) {
      rows.push(
        buildPdfRow(
          [
            entry.date,
            entry.direction,
            entry.name,
            entry.property,
            formatStatementMoney(entry.amount, entry.currency),
            entry.description,
          ],
          rowIndex++,
          statementColumns,
          compactRow,
        ),
      );
    }

    rows.push(
      buildPdfRow(
        [
          "",
          "",
          `Total ${category}`,
          "",
          formatStatementMoney(
            sumStatementEntries(categoryEntries),
            categoryEntries[0]?.currency ?? "USD",
          ),
          "",
        ],
        rowIndex++,
        statementColumns,
        { ...compactRow, fill: "#f5f7fa", isBold: true },
      ),
    );
  }

  rows.push(
    buildStatementTotalRow(
      totalLabel,
      formatStatementMoney(sumStatementEntries(entries), entries[0]?.currency ?? "USD"),
      rowIndex++,
    ),
  );

  return rowIndex;
}

function buildStatementTotalRow(label: string, amount: string, index: number) {
  return buildPdfRow(
    ["", "", label, "", amount, ""],
    index,
    statementColumns,
    {
      fill: "#e9eef6",
      fontSize: 8.6,
      isBold: true,
      lineHeight: 8.8,
      minHeight: 16,
      verticalPadding: 6,
    },
  );
}

function groupStatementEntries(entries: IncomeExpenseStatementEntry[]) {
  const groups = new Map<string, IncomeExpenseStatementEntry[]>();

  for (const entry of entries) {
    const key = `${entry.category}::${entry.currency}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return groups;
}

function sumStatementEntries(entries: IncomeExpenseStatementEntry[]) {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

function toIncomeExpenseStatementEntry(
  row: TrustedReport["rows"][number],
): IncomeExpenseStatementEntry | null {
  const amount = parseReportMoney(row.cells.amount ?? "");

  if (!amount) {
    return null;
  }

  const direction = row.cells.direction === "Expense" ? "Expense" : "Income";
  const unit = row.cells.unit ?? "";

  return {
    amount: amount.value,
    category: row.cells.category ?? "Uncategorized",
    currency: amount.currency,
    date: row.cells.date ?? "-",
    description: row.cells.description ?? "-",
    direction,
    name: unit && unit !== "Property-level" ? unit : "Property-level",
    property: row.cells.property ?? "-",
  };
}

function parseReportMoney(value: string) {
  const match = value.match(/^([A-Z]{3})\s+([\d,]+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  return {
    currency: match[1],
    value: Number.parseFloat(match[2].replaceAll(",", "")),
  };
}

function formatStatementMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function renderIncomeExpenseStatementPage({
  organizationName,
  page,
  pageIndex,
  report,
  totalPages,
}: {
  organizationName: string;
  page: PdfPage;
  pageIndex: number;
  report: TrustedReport;
  totalPages: number;
}) {
  const commands: string[] = [];
  const pageNumber = pageIndex + 1;

  drawIncomeExpenseHeader(commands, organizationName, report);
  drawStatementTableHeader(commands, statementTableTopY);

  let y = statementTableTopY - headerRowHeight;

  for (const row of page.rows) {
    y -= row.height;
    drawStatementTableRow(commands, row, y);
  }

  drawFooter(commands, pageNumber, totalPages);

  return commands.join("\n");
}

function drawStatementTableHeader(commands: string[], yTop: number) {
  drawRect(commands, marginX, yTop - headerRowHeight, tableWidth, headerRowHeight, {
    fill: "#f4f7fa",
  });
  drawLine(commands, marginX, yTop, marginX + tableWidth, yTop, colors.border, 0.6);
  drawLine(
    commands,
    marginX,
    yTop - headerRowHeight,
    marginX + tableWidth,
    yTop - headerRowHeight,
    colors.border,
    0.7,
  );

  let x = marginX;

  for (const column of statementColumns) {
    drawText(commands, column.label, x + cellPaddingX, yTop - 15, {
      align: column.align,
      bold: true,
      color: colors.ink,
      fontSize: 7.8,
      width: column.width - cellPaddingX * 2,
    });
    x += column.width;
  }
}

function drawStatementTableRow(commands: string[], row: PdfTableRow, y: number) {
  if (row.fill) {
    drawRect(commands, marginX, y, tableWidth, row.height, { fill: row.fill });
  }

  const isSummaryRow = Boolean(row.fill);
  const lineColor = isSummaryRow ? colors.border : "#e4eaf0";
  const lineWidth = isSummaryRow ? 0.65 : 0.35;

  drawLine(commands, marginX, y, marginX + tableWidth, y, lineColor, lineWidth);

  let x = marginX;

  for (const [cellIndex, column] of statementColumns.entries()) {
    drawCellText(commands, row.lines[cellIndex], x, y, column, row);
    x += column.width;
  }
}

function drawIncomeExpenseHeader(
  commands: string[],
  organizationName: string,
  report: TrustedReport,
) {
  drawText(commands, "Profit and loss details", marginX, 548, {
    color: colors.ink,
    fontSize: 18,
  });
  drawText(commands, report.periodLabel, marginX, 527, {
    color: colors.muted,
    fontSize: 11,
  });
  drawText(
    commands,
    `Cash basis ${formatLongReportDate(report.generatedAt)}`,
    marginX,
    507,
    {
      color: colors.ink,
      fontSize: 10.5,
    },
  );

  drawBrandPlaceholder(commands, organizationName);

  drawRect(commands, marginX, 473, 118, 24, {
    fill: "#ffffff",
    stroke: colors.accent,
  });
  drawText(commands, "Scope:", marginX + 6, 481, {
    bold: true,
    color: colors.ink,
    fontSize: 8.5,
  });
  drawText(commands, report.scopeLabel, marginX + 46, 481, {
    color: colors.ink,
    fontSize: 8.5,
    width: 66,
  });

  drawRect(commands, marginX + 126, 473, 148, 24, {
    fill: "#ffffff",
    stroke: colors.accent,
  });
  drawText(commands, "Beginning balance:", marginX + 132, 481, {
    bold: true,
    color: colors.ink,
    fontSize: 8.5,
  });
  drawText(commands, "No", marginX + 232, 481, {
    color: colors.ink,
    fontSize: 8.5,
  });

  drawLine(commands, marginX, 456, marginX + tableWidth, 456, colors.border, 0.6);
}

function drawBrandPlaceholder(commands: string[], organizationName: string) {
  const x = pageWidth - marginX - 150;
  const y = 522;

  drawRect(commands, x, y, 150, 48, {
    fill: "#ffffff",
    stroke: colors.border,
  });
  drawText(commands, "Company logo", x, y + 28, {
    align: "center",
    bold: true,
    color: colors.ink,
    fontSize: 12,
    width: 150,
  });
  drawText(commands, organizationName, x, y + 14, {
    align: "center",
    color: colors.muted,
    fontSize: 8,
    width: 150,
  });
  drawText(commands, "Branding settings", x, y + 4, {
    align: "center",
    color: colors.muted,
    fontSize: 7,
    width: 150,
  });
}

function drawTrustedReportHeader(
  commands: string[],
  organizationName: string,
  report: TrustedReport,
) {
  const rowCount = report.totalRowCount ?? report.rows.length;
  const sourceCount = report.rows.reduce((total, row) => total + row.sourceCount, 0);

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
  drawText(commands, "Property report", marginX + 38, 544, {
    color: colors.muted,
    fontSize: 8.5,
  });

  drawText(commands, `${report.title} - ${organizationName}`, 0, 550, {
    align: "center",
    bold: true,
    color: colors.ink,
    fontSize: 15,
    width: pageWidth,
  });
  drawText(
    commands,
    `Generated ${formatLongReportDate(report.generatedAt)}`,
    0,
    532,
    {
      align: "center",
      color: colors.muted,
      fontSize: 9.5,
      width: pageWidth,
    },
  );

  drawText(commands, "TRACEABLE OPERATING REPORT", pageWidth - marginX - 170, 557, {
    align: "right",
    bold: true,
    color: colors.warning,
    fontSize: 8,
    width: 170,
  });
  drawText(
    commands,
    `Prepared ${formatLongReportDate(new Date().toISOString())}`,
    pageWidth - marginX - 190,
    544,
    {
      align: "right",
      color: colors.muted,
      fontSize: 8,
      width: 190,
    },
  );

  drawRect(commands, marginX, 492, tableWidth, 30, {
    fill: colors.soft,
    stroke: colors.border,
  });
  drawRect(commands, marginX, 492, 4, 30, { fill: colors.accent });
  drawMeta(commands, "Scope", report.scopeLabel, marginX + 16, 501, 230);
  drawMeta(commands, "Period", report.periodLabel, marginX + 275, 501, 170);
  drawMeta(commands, "Rows", String(rowCount), marginX + 482, 501, 90);
  drawMeta(commands, "Source rows", String(sourceCount), marginX + 610, 501, 120);

  drawReportDescription(commands, report.description, 470);
  drawSummaryCards(commands, report);
  drawText(commands, `Trace: ${report.totalsTraceLabel}`, marginX, 395, {
    color: colors.muted,
    fontSize: 8,
    width: tableWidth,
  });
}

function drawReportDescription(
  commands: string[],
  description: string,
  y: number,
) {
  drawText(commands, "REPORT PURPOSE", marginX, y + 11, {
    bold: true,
    color: colors.muted,
    fontSize: 7,
    width: 120,
  });

  const lines = wrapText(description, tableWidth, 8.6, 2);

  lines.forEach((line, index) => {
    drawText(commands, line, marginX, y - index * 11, {
      color: colors.ink,
      fontSize: 8.6,
      width: tableWidth,
    });
  });
}

function drawSummaryCards(commands: string[], report: TrustedReport) {
  const metrics = report.summary.slice(0, 4);
  const cardGap = 8;
  const cardWidth = (tableWidth - cardGap * 3) / 4;
  const cardHeight = 42;
  const y = 418;

  metrics.forEach((metric, index) => {
    const x = marginX + index * (cardWidth + cardGap);

    drawRect(commands, x, y, cardWidth, cardHeight, {
      fill: "#ffffff",
      stroke: colors.border,
    });
    drawText(commands, metric.label.toUpperCase(), x + 8, y + 27, {
      bold: true,
      color: colors.muted,
      fontSize: 6.8,
      width: cardWidth - 16,
    });
    drawText(commands, metric.value, x + 8, y + 14, {
      bold: true,
      color: colors.ink,
      fontSize: 10,
      width: cardWidth - 16,
    });
    drawText(commands, `${metric.sourceCount} source rows`, x + 8, y + 4, {
      color: colors.muted,
      fontSize: 7,
      width: cardWidth - 16,
    });
  });
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

function drawTableHeader(
  commands: string[],
  yTop: number,
  pdfColumns: PdfColumn[],
) {
  drawRect(commands, marginX, yTop - headerRowHeight, tableWidth, headerRowHeight, {
    fill: colors.headerFill,
    stroke: colors.border,
  });

  let x = marginX;

  for (const column of pdfColumns) {
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

function drawTableRow(
  commands: string[],
  row: PdfTableRow,
  y: number,
  pdfColumns: PdfColumn[],
) {
  const fill = row.fill ?? (row.index % 2 === 0 ? colors.rowFill : colors.rowAlt);
  drawRect(commands, marginX, y, tableWidth, row.height, {
    fill,
    stroke: colors.border,
  });

  let x = marginX;

  for (const [cellIndex, column] of pdfColumns.entries()) {
    drawLine(commands, x, y, x, y + row.height, colors.border, 0.4);
    drawCellText(commands, row.lines[cellIndex], x, y, column, row);
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
  row: PdfTableRow,
) {
  const fontSize = row.fontSize ?? rowFontSize;
  const lineHeight = row.lineHeight ?? rowLineHeight;
  let textY = y + row.height - 5 - fontSize;
  const textWidthLimit = column.width - cellPaddingX * 2;

  for (const line of lines) {
    if (line === "") {
      textY -= lineHeight;
      continue;
    }

    drawText(commands, line, x + cellPaddingX, textY, {
      align: column.align,
      bold: row.isBold,
      color: row.textColor ?? colors.ink,
      fontSize,
      width: textWidthLimit,
    });
    textY -= lineHeight;
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
  if (value.trim() === "") {
    return [""];
  }

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
