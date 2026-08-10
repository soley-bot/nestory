import { getTrustedReport } from "@/features/reports/data/trusted-report";
import {
  formatLongReportDate,
  getReportExportFilename,
} from "@/features/reports/data/report-format";
import { formatDate } from "@/lib/dates/format";
import type { OwnerStatementPublicationModel } from "@/features/reports/data/owner-statement-report";
import type {
  OccupancyReport,
  OccupancyReportRow,
  ReportsViewQuery,
  TrustedReport,
  UnitProfitLossLine,
} from "@/features/reports/reports.types";

type PdfExport = {
  body: Uint8Array;
  filename: string;
};

type PdfExportValidation = {
  validation: {
    message: string;
    status: 400 | 409;
  };
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

type PdfPageSize = {
  height: number;
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

type UnitStatementFlowRow =
  | { height: number; kind: "section"; label: "EXPENSES" | "INCOME" }
  | {
      continued?: boolean;
      height: number;
      kind: "category";
      label: string;
    }
  | { height: number; kind: "entry"; line: UnitProfitLossLine }
  | { height: number; kind: "empty"; label: string }
  | {
      height: number;
      kind: "subtotal";
      label: "Expenses subtotal" | "Income subtotal";
      value: string;
    }
  | {
      expenseTotal: string;
      height: number;
      incomeTotal: string;
      kind: "totals";
      netIncome: string;
    };

type UnitStatementPage = {
  firstPage: boolean;
  rows: UnitStatementFlowRow[];
};

const pageWidth = 842;
const pageHeight = 595;
const landscapePageSize: PdfPageSize = {
  height: pageHeight,
  width: pageWidth,
};
const portraitA4PageSize: PdfPageSize = {
  height: 842,
  width: 595,
};
const marginX = 36;
const tableWidth = 770;
const unitStatementContentWidth = 523;
const rowFontSize = 8.2;
const rowLineHeight = 10.4;
const cellPaddingX = 5;
const tableTopY = 382;
const statementTableTopY = 438;
const tableBottomY = 45;
const headerRowHeight = 24;
const unitStatementFirstContentTop = 620;
const unitStatementContinuationContentTop = 704;
const unitStatementContentBottom = 58;
const unitStatementSectionHeight = 26;
const unitStatementCategoryMinHeight = 20;
const unitStatementCategoryTextWidth = 310;
const unitStatementEmptyHeight = 30;
const unitStatementSubtotalHeight = 28;
const unitStatementTotalsHeight = 82;

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

const unitStatementColumns: PdfColumn[] = [
  { label: "Date", maxLines: 1, width: 82 },
  { label: "Category / Description", maxLines: 2, width: 358 },
  { align: "right", label: "Amount", maxLines: 1, width: 83 },
];

const sourceTraceColumns: PdfColumn[] = [
  { label: "Report row", maxLines: 3, width: 160 },
  { label: "Source", maxLines: 3, width: 150 },
  { label: "Source ID", maxLines: 4, width: 170 },
  { label: "Source link", maxLines: 10, width: 290 },
];

const unitStatementSourceTraceColumns: PdfColumn[] = [
  { label: "Report row", maxLines: 3, width: 108 },
  { label: "Source", maxLines: 3, width: 103 },
  { label: "Source ID", maxLines: 4, width: 112 },
  { label: "Source link", maxLines: 10, width: 200 },
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
): Promise<PdfExport | PdfExportValidation> {
  const readinessReport = await getTrustedReport({
    organizationId,
    viewQuery,
  });
  if (readinessReport.exportValidation) {
    return { validation: readinessReport.exportValidation };
  }
  return {
    body: buildTrustedReportPdf({ organizationName, report: readinessReport }),
    filename: getReportExportFilename(readinessReport, viewQuery, "pdf"),
  };
}

export function buildTrustedReportPdf({
  organizationName,
  report,
}: {
  organizationName: string;
  report: TrustedReport;
}) {
  if (
    report.kind === "unit-profit-loss" &&
    report.unitProfitLossDetailScope === "single-unit"
  ) {
    return buildUnitProfitLossStatementPdf({ organizationName, report });
  }
  if (report.kind === "income-expense") {
    return buildIncomeExpenseStatementPdf({ organizationName, report });
  }
  const reportColumns = buildTrustedReportPdfColumns(report);
  const rows = buildTrustedReportPdfRows(report, reportColumns);
  const pages = paginateRows(rows);
  const sourceTraceRows = buildTrustedReportSourceTraceRows(report);
  const sourceTracePages =
    sourceTraceRows.length > 0 ? paginateRows(sourceTraceRows) : [];
  const totalPages = pages.length + sourceTracePages.length;
  const pageCommands = pages.map((page, pageIndex) =>
    renderTrustedReportPage({
      organizationName,
      page,
      pageIndex,
      report,
      reportColumns,
      totalPages,
    }),
  );
  pageCommands.push(
    ...sourceTracePages.map((page, sourcePageIndex) =>
      renderTrustedReportSourceTracePage({
        organizationName,
        page,
        pageIndex: pages.length + sourcePageIndex,
        report,
        totalPages,
      }),
    ),
  );

  return createPdfDocument(pageCommands);
}

export function buildOwnerStatementPdf(model: OwnerStatementPublicationModel) {
  const bodyGroups = chunk(model.lines, 20);
  const sourceRows = model.lines.flatMap((line) =>
    line.sources.map((source) => ({ line, source })),
  );
  const sourceGroups = chunk(sourceRows, 16);
  const totalPages = bodyGroups.length + sourceGroups.length;
  const pages = [
    ...bodyGroups.map((lines, index) =>
      renderOwnerStatementBodyPage(model, lines, index + 1, totalPages, index === 0),
    ),
    ...sourceGroups.map((sources, index) =>
      renderOwnerStatementSourcePage(
        model,
        sources,
        bodyGroups.length + index + 1,
        totalPages,
      ),
    ),
  ];
  return createPdfDocument(pages, portraitA4PageSize);
}

function renderOwnerStatementBodyPage(
  model: OwnerStatementPublicationModel,
  lines: OwnerStatementPublicationModel["lines"],
  pageNumber: number,
  totalPages: number,
  firstPage: boolean,
) {
  const commands: string[] = [];
  drawText(commands, "Official Owner Statement", 36, 798, {
    bold: true, color: colors.ink, fontSize: 18, width: 523,
  });
  drawText(commands, model.statementNumber, 36, 778, {
    bold: true, color: colors.accent, fontSize: 10, width: 523,
  });
  drawText(
    commands,
    `Period ${model.monthStart.slice(0, 7)} | Currency ${model.currency} | Revision ${model.revisionNumber}`,
    36,
    760,
    { color: colors.muted, fontSize: 8.5, width: 523 },
  );
  drawText(commands, `Property ${model.propertyId}`, 36, 744, {
    color: colors.muted, fontSize: 7.5, width: 523,
  });
  drawText(commands, `Owner ${model.ownerPersonId}`, 36, 730, {
    color: colors.muted, fontSize: 7.5, width: 523,
  });

  let y = 702;
  if (firstPage) {
    drawText(commands, "COMPONENT SUMMARY", 36, y, {
      bold: true, color: colors.muted, fontSize: 7.5, width: 523,
    });
    y -= 18;
    for (const component of model.components) {
      drawText(commands, sanitizeText(component.component.replaceAll("_", " ")), 42, y, {
        fontSize: 8, width: 225,
      });
      drawText(
        commands,
        `${model.currency} ${component.openingAmount} + ${component.movementAmount} = ${component.closingAmount}`,
        270,
        y,
        { align: "right", fontSize: 8, width: 285 },
      );
      y -= 17;
    }
    y -= 8;
  }
  drawText(commands, firstPage ? "FROZEN STATEMENT LINES" : "FROZEN STATEMENT LINES - CONTINUED", 36, y, {
    bold: true, color: colors.muted, fontSize: 7.5, width: 523,
  });
  y -= 20;
  for (const line of lines) {
    drawText(
      commands,
      `${line.lineNumber}. ${line.businessDate} | ${sanitizeText(line.description)}`,
      42,
      y,
      { bold: true, fontSize: 7.6, width: 370 },
    );
    drawText(commands, `${model.currency} ${line.signedAmount}`, 420, y, {
      align: "right", fontSize: 7.6, width: 135,
    });
    y -= 13;
    drawText(
      commands,
      `${line.lineKind}${line.component ? ` | ${line.component}` : ""} | ${line.sourceCount} source${line.sourceCount === 1 ? "" : "s"}`,
      42,
      y,
      { color: colors.muted, fontSize: 6.8, width: 510 },
    );
    y -= 18;
  }
  drawOwnerStatementFooter(commands, model, pageNumber, totalPages);
  return commands.join("\n");
}

function renderOwnerStatementSourcePage(
  model: OwnerStatementPublicationModel,
  sources: Array<{
    line: OwnerStatementPublicationModel["lines"][number];
    source: OwnerStatementPublicationModel["lines"][number]["sources"][number];
  }>,
  pageNumber: number,
  totalPages: number,
) {
  const commands: string[] = [];
  drawText(commands, "Official Owner Statement", 36, 798, {
    bold: true, fontSize: 15, width: 523,
  });
  drawText(commands, `${model.statementNumber} | SOURCE TRACE`, 36, 774, {
    bold: true, color: colors.accent, fontSize: 9, width: 523,
  });
  let y = 744;
  for (const { line, source } of sources) {
    drawText(commands, `Line ${line.lineNumber} | ${sanitizeText(source.sourceType)}`, 42, y, {
      bold: true, fontSize: 7.4, width: 510,
    });
    y -= 12;
    drawText(commands, `Source line ${source.sourceLineId}`, 42, y, {
      fontSize: 6.8, width: 510,
    });
    y -= 12;
    drawText(commands, `Source ${source.sourceId}`, 42, y, {
      fontSize: 6.8, width: 510,
    });
    y -= 12;
    drawText(commands, `SHA-256 ${source.sourceFingerprint}`, 42, y, {
      color: colors.muted, fontSize: 6.4, width: 510,
    });
    y -= 20;
  }
  drawOwnerStatementFooter(commands, model, pageNumber, totalPages);
  return commands.join("\n");
}

function drawOwnerStatementFooter(
  commands: string[],
  model: OwnerStatementPublicationModel,
  pageNumber: number,
  totalPages: number,
) {
  drawLine(commands, 36, 38, 559, 38, colors.border, 0.6);
  drawText(commands, `Content ${model.contentHash}`, 36, 24, {
    color: colors.muted, fontSize: 5.8, width: 410,
  });
  drawText(commands, `Page ${pageNumber} of ${totalPages}`, 450, 24, {
    align: "right", color: colors.muted, fontSize: 7, width: 109,
  });
}

function chunk<T>(items: T[], size: number) {
  if (items.length === 0) return [[]] as T[][];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function buildTrustedReportSourceTraceRows(
  report: TrustedReport,
  columns = sourceTraceColumns,
) {
  let sourceIndex = 0;

  return report.rows.flatMap((row, rowIndex) =>
    row.sourceLinks.map((source) =>
      buildPdfRow(
        [
          `${rowIndex + 1}. ${row.title}`,
          `${source.recordType}:${source.label}`,
          source.id,
          source.href ?? "No source link",
        ],
        sourceIndex++,
        columns,
        {
          fontSize: 7.2,
          lineHeight: 8.4,
          minHeight: 22,
          verticalPadding: 8,
        },
      ),
    ),
  );
}

function renderTrustedReportSourceTracePage({
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

  drawTrustedReportHeader(commands, organizationName, report);
  drawText(commands, "SOURCE TRACE", marginX, 400, {
    bold: true,
    color: colors.muted,
    fontSize: 7,
    width: tableWidth,
  });
  drawTableHeader(commands, tableTopY, sourceTraceColumns);

  let y = tableTopY - headerRowHeight;
  for (const row of page.rows) {
    y -= row.height;
    drawTableRow(commands, row, y, sourceTraceColumns);
  }

  drawFooter(commands, pageIndex + 1, totalPages);
  return commands.join("\n");
}

function renderUnitProfitLossSourceTracePage({
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

  drawUnitProfitLossHeader(commands, organizationName, report, false);
  drawText(commands, "SOURCE TRACE", marginX, 720, {
    bold: true,
    color: colors.muted,
    fontSize: 7,
    width: unitStatementContentWidth,
  });
  drawTableHeader(
    commands,
    unitStatementContinuationContentTop,
    unitStatementSourceTraceColumns,
  );

  let y = unitStatementContinuationContentTop - headerRowHeight;
  for (const row of page.rows) {
    y -= row.height;
    drawTableRow(commands, row, y, unitStatementSourceTraceColumns);
  }

  drawUnitProfitLossFooter(commands, pageIndex + 1, totalPages);
  return commands.join("\n");
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

function buildUnitProfitLossStatementPdf({
  organizationName,
  report,
}: {
  organizationName: string;
  report: TrustedReport;
}) {
  const lines = report.unitProfitLossLines ?? [];
  const incomeLines = lines.filter(({ direction }) => direction === "income");
  const expenseLines = lines.filter(({ direction }) => direction === "expense");
  const incomeTotal =
    report.summary.find(({ label }) => label === "Income")?.value ?? "USD 0.00";
  const expenseTotal =
    report.summary.find(({ label }) => label === "Expenses")?.value ??
    "USD 0.00";
  const netIncome =
    report.summary.find(({ label }) => label === "Net income")?.value ??
    "USD 0.00";
  const rows = buildUnitStatementFlowRows({
    expenseLines,
    incomeTotal,
    expenseTotal,
    incomeLines,
    netIncome,
  });
  const pages = paginateUnitStatementRows(rows);
  const sourceTraceRows = buildTrustedReportSourceTraceRows(
    report,
    unitStatementSourceTraceColumns,
  );
  const sourceTracePages =
    sourceTraceRows.length > 0
      ? paginateRows(sourceTraceRows, unitStatementContinuationContentTop)
      : [];
  const totalPages = pages.length + sourceTracePages.length;
  const renderedSections = new Set<"EXPENSES" | "INCOME">();
  const pageCommands = pages.map((page, pageIndex) =>
    renderUnitProfitLossPage({
      organizationName,
      page,
      pageIndex,
      renderedSections,
      report,
      totalPages,
    }),
  );
  pageCommands.push(
    ...sourceTracePages.map((page, sourcePageIndex) =>
      renderUnitProfitLossSourceTracePage({
        organizationName,
        page,
        pageIndex: pages.length + sourcePageIndex,
        report,
        totalPages,
      }),
    ),
  );

  return createPdfDocument(pageCommands, portraitA4PageSize);
}

function buildUnitStatementFlowRows({
  expenseLines,
  expenseTotal,
  incomeLines,
  incomeTotal,
  netIncome,
}: {
  expenseLines: UnitProfitLossLine[];
  expenseTotal: string;
  incomeLines: UnitProfitLossLine[];
  incomeTotal: string;
  netIncome: string;
}): UnitStatementFlowRow[] {
  const buildEntries = (lines: UnitProfitLossLine[]) =>
    lines.map(
      (line): UnitStatementFlowRow => {
        const descriptionLines = wrapText(line.description, 332, 8.6, 2);
        const height = Math.max(26, descriptionLines.length * 10.5 + 10);

        return { height, kind: "entry", line };
      },
    );
  const buildCategoryRows = (lines: UnitProfitLossLine[]) =>
    groupUnitStatementLines(lines).flatMap(([category, categoryLines]) => {
      const categoryTextLines = wrapText(
        category,
        unitStatementCategoryTextWidth,
        8.4,
        1,
      );

      return [
        {
          height: Math.max(
            unitStatementCategoryMinHeight,
            categoryTextLines.length * 10 + 10,
          ),
          kind: "category" as const,
          label: category,
        },
        ...buildEntries(categoryLines),
      ];
    });

  return [
    {
      height: unitStatementSectionHeight,
      kind: "section",
      label: "INCOME",
    },
    ...(incomeLines.length > 0
      ? buildCategoryRows(incomeLines)
      : [
          {
            height: unitStatementEmptyHeight,
            kind: "empty" as const,
            label: "No income recorded",
          },
        ]),
    {
      height: unitStatementSubtotalHeight,
      kind: "subtotal",
      label: "Income subtotal",
      value: incomeTotal,
    },
    {
      height: unitStatementSectionHeight,
      kind: "section",
      label: "EXPENSES",
    },
    ...(expenseLines.length > 0
      ? buildCategoryRows(expenseLines)
      : [
          {
            height: unitStatementEmptyHeight,
            kind: "empty" as const,
            label: "No expenses recorded",
          },
        ]),
    {
      height: unitStatementSubtotalHeight,
      kind: "subtotal",
      label: "Expenses subtotal",
      value: expenseTotal,
    },
    {
      expenseTotal,
      height: unitStatementTotalsHeight,
      incomeTotal,
      kind: "totals",
      netIncome,
    },
  ];
}

function groupUnitStatementLines(lines: UnitProfitLossLine[]) {
  const groups = new Map<string, UnitProfitLossLine[]>();

  for (const line of lines) {
    const category = line.category.trim() || "Uncategorized";
    const categoryLines = groups.get(category) ?? [];
    categoryLines.push(line);
    groups.set(category, categoryLines);
  }

  return [...groups.entries()];
}

function paginateUnitStatementRows(
  rows: UnitStatementFlowRow[],
): UnitStatementPage[] {
  const pages: UnitStatementPage[] = [{ firstPage: true, rows: [] }];
  let page = pages[0];
  let remainingHeight =
    unitStatementFirstContentTop - unitStatementContentBottom;
  let activeSection: "EXPENSES" | "INCOME" | undefined;
  let activeCategory:
    | Extract<UnitStatementFlowRow, { kind: "category" }>
    | undefined;

  const startPage = (
    continuedSection?: "EXPENSES" | "INCOME",
    continuedCategory?: Extract<UnitStatementFlowRow, { kind: "category" }>,
  ) => {
    page = { firstPage: false, rows: [] };
    pages.push(page);
    remainingHeight =
      unitStatementContinuationContentTop - unitStatementContentBottom;

    if (continuedSection) {
      page.rows.push({
        height: unitStatementSectionHeight,
        kind: "section",
        label: continuedSection,
      });
      remainingHeight -= unitStatementSectionHeight;
    }

    if (continuedCategory) {
      page.rows.push({ ...continuedCategory, continued: true });
      remainingHeight -= continuedCategory.height;
    }
  };

  for (const [index, row] of rows.entries()) {
    if (row.kind === "section") {
      const firstSectionRow = rows[index + 1];
      const firstCategoryEntry = rows[index + 2];
      const firstSectionRowHeight =
        firstSectionRow?.kind === "category"
          ? firstSectionRow.height +
            (firstCategoryEntry?.kind === "entry"
              ? firstCategoryEntry.height
              : 0)
          : firstSectionRow?.kind === "entry" ||
              firstSectionRow?.kind === "empty"
            ? firstSectionRow.height
            : 0;

      if (
        remainingHeight < row.height + firstSectionRowHeight &&
        page.rows.length > 0
      ) {
        startPage();
      }

      page.rows.push(row);
      remainingHeight -= row.height;
      activeSection = row.label;
      activeCategory = undefined;
      continue;
    }

    if (row.kind === "category") {
      const firstCategoryRow = rows[index + 1];
      const firstCategoryRowHeight =
        firstCategoryRow?.kind === "entry" ? firstCategoryRow.height : 0;

      if (
        remainingHeight < row.height + firstCategoryRowHeight &&
        page.rows.length > 0
      ) {
        startPage(activeSection);
      }

      page.rows.push(row);
      remainingHeight -= row.height;
      activeCategory = row;
      continue;
    }

    if (row.height > remainingHeight) {
      startPage(activeSection, row.kind === "entry" ? activeCategory : undefined);
    }

    page.rows.push(row);
    remainingHeight -= row.height;

    if (row.kind === "subtotal") {
      activeSection = undefined;
      activeCategory = undefined;
    }
  }

  return pages;
}

function renderUnitProfitLossPage({
  organizationName,
  page,
  pageIndex,
  renderedSections,
  report,
  totalPages,
}: {
  organizationName: string;
  page: UnitStatementPage;
  pageIndex: number;
  renderedSections: Set<"EXPENSES" | "INCOME">;
  report: TrustedReport;
  totalPages: number;
}) {
  const commands: string[] = [];
  const contentTop = page.firstPage
    ? unitStatementFirstContentTop
    : unitStatementContinuationContentTop;

  drawUnitProfitLossHeader(
    commands,
    organizationName,
    report,
    page.firstPage,
  );
  drawUnitProfitLossTableHeader(commands, contentTop + headerRowHeight);

  let y = contentTop;
  let entryIndex = 0;

  for (const row of page.rows) {
    y -= row.height;

    if (row.kind === "section") {
      const continued = renderedSections.has(row.label);
      drawUnitProfitLossSectionRow(commands, row, y, continued);
      renderedSections.add(row.label);
    } else if (row.kind === "category") {
      drawUnitProfitLossCategoryRow(commands, row, y);
    } else if (row.kind === "entry") {
      drawUnitProfitLossEntryRow(commands, row, y, entryIndex);
      entryIndex += 1;
    } else if (row.kind === "empty") {
      drawUnitProfitLossEmptyRow(commands, row, y);
    } else if (row.kind === "subtotal") {
      drawUnitProfitLossSubtotalRow(commands, row, y);
    } else {
      drawUnitProfitLossTotals(
        commands,
        row.incomeTotal,
        row.expenseTotal,
        row.netIncome,
        y + 60,
      );
    }
  }

  drawUnitProfitLossFooter(commands, pageIndex + 1, totalPages);
  return commands.join("\n");
}

function drawUnitProfitLossHeader(
  commands: string[],
  organizationName: string,
  report: TrustedReport,
  firstPage: boolean,
) {
  if (!firstPage) {
    drawText(commands, report.title, marginX, 806, {
      bold: true,
      color: colors.ink,
      fontSize: 18,
      width: unitStatementContentWidth,
    });
    drawText(commands, report.scopeLabel, marginX, 782, {
      bold: true,
      color: colors.ink,
      fontSize: 9.5,
      width: unitStatementContentWidth,
    });
    drawText(commands, report.periodLabel, marginX, 763, {
      color: colors.muted,
      fontSize: 8.5,
      width: 260,
    });
    drawText(commands, "Cash basis", marginX, 746, {
      color: colors.muted,
      fontSize: 8,
      width: 250,
    });
    return;
  }

  drawText(commands, "Nestory", marginX, 806, {
    bold: true,
    color: colors.ink,
    fontSize: 11,
    width: 220,
  });
  drawText(commands, organizationName, marginX, 790, {
    color: colors.muted,
    fontSize: 8.5,
    width: 260,
  });
  drawText(commands, report.title, marginX, 752, {
    bold: true,
    color: colors.ink,
    fontSize: 22,
    width: unitStatementContentWidth,
  });
  drawText(commands, report.scopeLabel, marginX, 727, {
    bold: true,
    color: colors.ink,
    fontSize: 10,
    width: unitStatementContentWidth,
  });
  drawText(commands, report.periodLabel, marginX, 709, {
    color: colors.muted,
    fontSize: 9,
    width: 250,
  });
  drawText(
    commands,
    `Generated ${formatDate(report.generatedAt)}`,
    marginX,
    692,
    {
      color: colors.muted,
      fontSize: 8,
      width: 250,
    },
  );
  drawText(commands, "Cash basis", marginX, 675, {
    color: colors.muted,
    fontSize: 8,
    width: 250,
  });
}

function drawUnitProfitLossSectionRow(
  commands: string[],
  row: Extract<UnitStatementFlowRow, { kind: "section" }>,
  y: number,
  continued: boolean,
) {
  const label = continued
    ? `${row.label[0]}${row.label.slice(1).toLowerCase()} (continued)`
    : row.label;

  drawText(commands, label, marginX, y + 9, {
    bold: true,
    color: colors.ink,
    fontSize: 9,
    width: unitStatementContentWidth,
  });
}

function drawUnitProfitLossEntryRow(
  commands: string[],
  row: Extract<UnitStatementFlowRow, { kind: "entry" }>,
  y: number,
  index: number,
) {
  const [dateColumn, detailColumn, amountColumn] = unitStatementColumns;
  const detailX = marginX + dateColumn.width;
  const amountX = detailX + detailColumn.width;
  const textY = y + row.height - 5 - 8.6;
  const descriptionLines = wrapText(
    row.line.description,
    detailColumn.width - cellPaddingX * 2 - 14,
    8.6,
    detailColumn.maxLines ?? 2,
  );
  const amount = formatExactMoneyCents(
    row.line.amountCents,
    row.line.currency,
  );
  const amountTextWidth = amountColumn.width - cellPaddingX * 2;
  const amountFontSize = fitTextToWidth(amount, amountTextWidth, 8.6);

  drawRect(commands, marginX, y, unitStatementContentWidth, row.height, {
    fill: index % 2 === 0 ? colors.rowFill : colors.rowAlt,
  });
  drawLine(
    commands,
    marginX,
    y,
    marginX + unitStatementContentWidth,
    y,
    colors.border,
    0.35,
  );
  drawText(commands, formatDate(row.line.date), marginX + cellPaddingX, textY, {
    color: colors.ink,
    fontSize: 8.6,
    width: dateColumn.width - cellPaddingX * 2,
  });
  drawText(commands, "-", detailX + cellPaddingX + 2, textY, {
    color: colors.muted,
    fontSize: 8.6,
    width: 8,
  });

  for (const [lineIndex, line] of descriptionLines.entries()) {
    drawText(
      commands,
      line,
      detailX + cellPaddingX + 14,
      textY - lineIndex * 11,
      {
        color: colors.ink,
        fontSize: 8.6,
        width: detailColumn.width - cellPaddingX * 2 - 14,
      },
    );
  }

  drawText(
    commands,
    amount,
    amountX + cellPaddingX,
    textY,
    {
      align: "right",
      color: colors.ink,
      fontSize: amountFontSize,
      width: amountTextWidth,
    },
  );
}

function formatExactMoneyCents(cents: bigint, currency: string) {
  const sign = cents < BigInt(0) ? "-" : "";
  const magnitude = cents < BigInt(0) ? -cents : cents;
  const dollars = magnitude / BigInt(100);
  const fraction = (magnitude % BigInt(100)).toString().padStart(2, "0");
  const groupedDollars = dollars
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}${currency} ${groupedDollars}.${fraction}`;
}

function fitTextToWidth(value: string, maxWidth: number, preferredSize: number) {
  const preferredWidth = estimateTextWidth(value, preferredSize);

  return preferredWidth <= maxWidth
    ? preferredSize
    : preferredSize * (maxWidth / preferredWidth);
}

function drawUnitProfitLossCategoryRow(
  commands: string[],
  row: Extract<UnitStatementFlowRow, { kind: "category" }>,
  y: number,
) {
  const [dateColumn, detailColumn] = unitStatementColumns;
  const detailX = marginX + dateColumn.width;
  const lines = wrapText(
    row.continued ? `${row.label} (continued)` : row.label,
    unitStatementCategoryTextWidth,
    8.4,
    1,
  );
  let textY = y + row.height - 5 - 8.4;

  drawRect(commands, marginX, y, unitStatementContentWidth, row.height, {
    fill: colors.soft,
  });
  drawLine(
    commands,
    marginX,
    y,
    marginX + unitStatementContentWidth,
    y,
    colors.border,
    0.35,
  );

  for (const line of lines) {
    drawText(commands, line, detailX + cellPaddingX, textY, {
      bold: true,
      color: colors.accent,
      fontSize: 8.4,
      width: detailColumn.width - cellPaddingX * 2,
    });
    textY -= 10;
  }
}

function drawUnitProfitLossEmptyRow(
  commands: string[],
  row: Extract<UnitStatementFlowRow, { kind: "empty" }>,
  y: number,
) {
  drawRect(commands, marginX, y, unitStatementContentWidth, row.height, {
    fill: colors.rowFill,
  });
  drawLine(
    commands,
    marginX,
    y,
    marginX + unitStatementContentWidth,
    y,
    colors.border,
    0.35,
  );
  drawText(commands, row.label, marginX + cellPaddingX, y + 11, {
    color: colors.muted,
    fontSize: 8.5,
    width: unitStatementContentWidth - cellPaddingX * 2,
  });
}

function drawUnitProfitLossSubtotalRow(
  commands: string[],
  row: Extract<UnitStatementFlowRow, { kind: "subtotal" }>,
  y: number,
) {
  drawLine(
    commands,
    marginX,
    y + row.height,
    marginX + unitStatementContentWidth,
    y + row.height,
    colors.border,
    0.7,
  );
  drawText(commands, row.label, marginX + 250, y + 10, {
    align: "right",
    bold: true,
    color: colors.ink,
    fontSize: 8.5,
    width: 178,
  });
  drawText(commands, row.value, marginX + 440, y + 10, {
    align: "right",
    bold: true,
    color: colors.ink,
    fontSize: 8.5,
    width: 83,
  });
}

function drawUnitProfitLossTableHeader(commands: string[], yTop: number) {
  drawRect(
    commands,
    marginX,
    yTop - headerRowHeight,
    unitStatementContentWidth,
    headerRowHeight,
    {
      fill: colors.headerFill,
      stroke: colors.border,
    },
  );

  let x = marginX;
  for (const column of unitStatementColumns) {
    drawText(commands, column.label, x + cellPaddingX, yTop - 15, {
      align: column.align,
      bold: true,
      color: colors.ink,
      fontSize: 7.6,
      width: column.width - cellPaddingX * 2,
    });
    x += column.width;
  }
}

function drawUnitProfitLossTotals(
  commands: string[],
  incomeTotal: string,
  expenseTotal: string,
  netIncome: string,
  yTop: number,
) {
  const labelX = marginX + 250;
  const labelWidth = 178;
  const amountX = marginX + 440;
  const amountWidth = 83;

  [
    ["Total income", incomeTotal],
    ["Total expenses", expenseTotal],
    ["Net income", netIncome],
  ].forEach(([label, value], index) => {
    const y = yTop - index * 22;
    drawText(commands, label, labelX, y, {
      align: "right",
      bold: index === 2,
      color: colors.ink,
      fontSize: index === 2 ? 10 : 8.5,
      width: labelWidth,
    });
    drawText(commands, value, amountX, y, {
      align: "right",
      bold: index === 2,
      color: colors.ink,
      fontSize: index === 2 ? 10 : 8.5,
      width: amountWidth,
    });
  });
}

function drawUnitProfitLossFooter(
  commands: string[],
  pageNumber: number,
  totalPages: number,
) {
  drawLine(
    commands,
    marginX,
    30,
    marginX + unitStatementContentWidth,
    30,
    colors.border,
    0.6,
  );
  drawText(commands, "Nestory unit financial statement", marginX, 18, {
    color: colors.muted,
    fontSize: 8,
  });
  drawText(commands, `Page ${pageNumber} of ${totalPages}`, marginX, 18, {
    align: "right",
    color: colors.muted,
    fontSize: 8,
    width: unitStatementContentWidth,
  });
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
    "Available units",
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

  const text = sanitizeText(value);

  if (maxLines <= 1) {
    return [truncateSingleLineToWidth(text, maxWidth, fontSize)];
  }

  const words = text.split(/\s+/).filter(Boolean);
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
  trimmed[trimmed.length - 1] =
    `${trimmed[trimmed.length - 1].replace(/\.*$/, "")}...`;

  return trimmed;
}

function truncateSingleLineToWidth(
  value: string,
  maxWidth: number,
  fontSize: number,
) {
  if (estimateTextWidth(value, fontSize) <= maxWidth) {
    return value;
  }

  return ellipsizeTextToWidth(value, maxWidth, fontSize);
}

function ellipsizeTextToWidth(
  value: string,
  maxWidth: number,
  fontSize: number,
) {
  const ellipsis = "...";
  const text = value.replace(/\.*$/, "");

  if (estimateTextWidth(ellipsis, fontSize) > maxWidth) {
    return "";
  }

  let truncated = "";

  for (const char of text) {
    const candidate = `${truncated}${char}`;

    if (estimateTextWidth(`${candidate}${ellipsis}`, fontSize) > maxWidth) {
      break;
    }

    truncated = candidate;
  }

  return `${truncated}${ellipsis}`;
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

function createPdfDocument(
  pageContents: string[],
  pageSize: PdfPageSize = landscapePageSize,
) {
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
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
