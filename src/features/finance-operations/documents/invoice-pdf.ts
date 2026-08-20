import type { TenantInvoicePdfModel } from "@/features/finance-operations/documents/commercial-document.types";
import {
  buildCommercialPdf,
  commercialPdfColors,
  drawCommercialImage,
  drawCommercialLine,
  drawCommercialRect,
  drawCommercialText,
  drawCommercialTwoColumnTableHeader,
  drawCommercialTwoColumnTableRow,
  fitCommercialImage,
  formatCommercialDate,
  formatCommercialMoney,
  paginateCommercialTableRows,
  wrapCommercialText,
} from "@/features/finance-operations/documents/commercial-pdf-primitives";

type InvoiceRow = {
  amount: string;
  height: number;
  lines: string[];
};

const margin = 42;
const contentWidth = 511;
const tableBottom = 112;
const firstTableTop = 548;
const continuedTableTop = 692;
const tableHeaderHeight = 25;
const descriptionWidth = 359;
const amountWidth = contentWidth - descriptionWidth;

export function buildTenantInvoicePdf(model: TenantInvoicePdfModel): Uint8Array {
  const rows = model.lines.map((line) => {
    const description = line.description
      ? `${line.label} - ${line.description}`
      : line.label;
    const lines = wrapCommercialText(description, descriptionWidth - 20, 8.5);
    return {
      amount: formatCommercialMoney(line.amount, model.currency),
      height: Math.max(31, lines.length * 11 + 14),
      lines,
    };
  });
  const pages = paginateCommercialTableRows(rows, {
    continuedTableTop,
    firstTableTop,
    tableBottom,
    tableHeaderHeight,
  });
  const lastPage = pages[pages.length - 1];
  const lastTop = pages.length === 1 ? firstTableTop : continuedTableTop;
  const lastUsedHeight = lastPage.reduce((sum, row) => sum + row.height, 0);
  if (lastTop - tableHeaderHeight - lastUsedHeight - tableBottom < 88) {
    pages.push([]);
  }

  const pageContents = pages.map((pageRows, pageIndex) =>
    renderInvoicePage(model, pageRows, pageIndex, pages.length),
  );
  const assets = model.issuer.logo
    ? [{ ...model.issuer.logo, name: "Logo" }]
    : [];
  return buildCommercialPdf(pageContents, assets);
}

function renderInvoicePage(
  model: TenantInvoicePdfModel,
  rows: InvoiceRow[],
  pageIndex: number,
  totalPages: number,
) {
  const commands: string[] = [];
  drawInvoiceHeader(commands, model, pageIndex > 0);
  if (pageIndex === 0) drawInvoiceIdentity(commands, model);
  const tableTop = pageIndex === 0 ? firstTableTop : continuedTableTop;
  drawCommercialTwoColumnTableHeader(commands, {
    amountWidth,
    contentWidth,
    descriptionWidth,
    leftLabel: "DESCRIPTION",
    margin,
    rightLabel: "AMOUNT",
    tableHeaderHeight,
    yTop: tableTop,
  });

  let y = tableTop - tableHeaderHeight;
  rows.forEach((row, index) => {
    y -= row.height;
    drawCommercialTwoColumnTableRow(commands, row, {
      amountWidth,
      contentWidth,
      descriptionWidth,
      index,
      margin,
      y,
    });
  });

  if (pageIndex === totalPages - 1) drawInvoiceTotal(commands, model, y - 18);
  drawInvoiceFooter(commands, model, pageIndex + 1, totalPages);
  return commands.join("\n");
}

function drawInvoiceHeader(
  commands: string[],
  model: TenantInvoicePdfModel,
  continued: boolean,
) {
  if (model.issuer.logo) {
    const fitted = fitCommercialImage(model.issuer.logo, 70, 38);
    drawCommercialImage(
      commands,
      "Logo",
      margin,
      766 + (38 - fitted.height) / 2,
      fitted.width,
      fitted.height,
    );
  }
  const issuerX = model.issuer.logo ? 122 : margin;
  drawCommercialText(commands, model.issuer.name, issuerX, 793, {
    bold: true,
    fontSize: 12,
    width: 275,
  });
  const contacts = [model.issuer.contactEmail, model.issuer.contactPhone]
    .filter(Boolean)
    .join(" | ");
  if (contacts) {
    drawCommercialText(commands, contacts, issuerX, 778, {
      color: commercialPdfColors.muted,
      fontSize: 7.5,
      width: 275,
    });
  }
  drawCommercialText(commands, "INVOICE", 350, 786, {
    align: "right",
    bold: true,
    fontSize: 22,
    width: 203,
  });
  drawCommercialText(commands, model.invoiceNumber, 350, 769, {
    align: "right",
    color: commercialPdfColors.muted,
    fontSize: 9,
    width: 203,
  });
  drawCommercialLine(commands, margin, 752, 553, 752, commercialPdfColors.strong, 1.2);
  if (continued) {
    drawCommercialText(commands, "CONTINUED", margin, 721, {
      bold: true,
      color: commercialPdfColors.muted,
      fontSize: 8,
    });
  }
  if (model.voided) drawStatus(commands, "VOID");
}

function drawInvoiceIdentity(commands: string[], model: TenantInvoicePdfModel) {
  drawLabelValue(commands, "BILL TO", model.recipientLabel, margin, 719, 235);
  drawLabelValue(
    commands,
    "PROPERTY",
    [model.propertyLabel, model.unitLabel].filter(Boolean).join(" / "),
    margin,
    678,
    235,
  );
  drawLabelValue(
    commands,
    "OCCUPANTS",
    model.occupantLabels.length ? model.occupantLabels.join(", ") : "-",
    margin,
    637,
    235,
  );
  drawLabelValue(
    commands,
    "ISSUE DATE",
    formatCommercialDate(model.issueDate),
    337,
    719,
    216,
  );
  drawLabelValue(
    commands,
    "DUE DATE",
    formatCommercialDate(model.dueDate),
    337,
    678,
    216,
  );
  drawLabelValue(
    commands,
    "BILLING PERIOD",
    `${formatCommercialDate(model.billingPeriodStart)} - ${formatCommercialDate(model.billingPeriodEnd)}`,
    337,
    637,
    216,
  );
}

function drawInvoiceTotal(
  commands: string[],
  model: TenantInvoicePdfModel,
  y: number,
) {
  drawCommercialRect(commands, 337, y - 46, 216, 46, {
    fill: commercialPdfColors.strong,
  });
  drawCommercialText(commands, "TOTAL DUE", 349, y - 19, {
    bold: true,
    color: "#ffffff",
    fontSize: 9,
    width: 80,
  });
  drawCommercialText(
    commands,
    formatCommercialMoney(model.totalAmount, model.currency),
    431,
    y - 21,
    {
      align: "right",
      bold: true,
      color: "#ffffff",
      fontSize: 13,
      width: 110,
    },
  );
}

function drawInvoiceFooter(
  commands: string[],
  model: TenantInvoicePdfModel,
  pageNumber: number,
  totalPages: number,
) {
  drawCommercialLine(commands, margin, 55, 553, 55);
  drawCommercialText(commands, "NOT A TAX INVOICE", margin, 36, {
    bold: true,
    color: commercialPdfColors.muted,
    fontSize: 7,
  });
  drawCommercialText(commands, model.issuer.name, 188, 36, {
    align: "center",
    color: commercialPdfColors.muted,
    fontSize: 7,
    width: 220,
  });
  drawCommercialText(commands, `Page ${pageNumber} of ${totalPages}`, 449, 36, {
    align: "right",
    color: commercialPdfColors.muted,
    fontSize: 7,
    width: 104,
  });
}

function drawStatus(commands: string[], label: string) {
  drawCommercialRect(commands, 458, 720, 95, 22, {
    fill: commercialPdfColors.soft,
    stroke: commercialPdfColors.strong,
  });
  drawCommercialText(commands, label, 458, 727, {
    align: "center",
    bold: true,
    fontSize: 9,
    width: 95,
  });
}

function drawLabelValue(
  commands: string[],
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  drawCommercialText(commands, label, x, y, {
    bold: true,
    color: commercialPdfColors.muted,
    fontSize: 6.8,
    width,
  });
  const lines = wrapCommercialText(value, width, 9.5).slice(0, 2);
  lines.forEach((line, index) => {
    drawCommercialText(commands, line, x, y - 16 - index * 11, {
      bold: true,
      fontSize: 9.5,
      width,
    });
  });
}
