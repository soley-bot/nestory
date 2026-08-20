import type { TenantInvoicePdfModel } from "@/features/finance-operations/documents/commercial-document.types";
import {
  buildCommercialPdf,
  commercialPdfColors,
  drawCommercialImage,
  drawCommercialIdentityFields,
  drawCommercialLine,
  drawCommercialRect,
  drawCommercialText,
  drawCommercialTwoColumnTableHeader,
  drawCommercialTwoColumnTableRow,
  fitCommercialImage,
  formatCommercialDate,
  formatCommercialMoney,
  getCommercialIdentityBottom,
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
const maximumFirstTableTop = 548;
const continuedTableTop = 692;
const tableHeaderHeight = 25;
const descriptionWidth = 359;
const amountWidth = contentWidth - descriptionWidth;

export function buildTenantInvoicePdf(model: TenantInvoicePdfModel): Uint8Array {
  const identity = invoiceIdentityFields(model);
  const firstTableTop = Math.min(
    maximumFirstTableTop,
    getCommercialIdentityBottom(identity.left, 719, 235) - 18,
    getCommercialIdentityBottom(identity.right, 719, 216) - 18,
  );
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
  if (
    lastTop - tableHeaderHeight - lastUsedHeight - tableBottom <
    invoiceSummaryHeight(model)
  ) {
    pages.push([]);
  }

  const pageContents = pages.map((pageRows, pageIndex) =>
    renderInvoicePage(
      model,
      pageRows,
      pageIndex,
      pages.length,
      firstTableTop,
    ),
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
  firstTableTop: number,
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

  if (pageIndex === totalPages - 1) {
    drawInvoiceSummary(commands, model, y - 18);
  }
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
  const fields = invoiceIdentityFields(model);
  drawCommercialIdentityFields(commands, fields.left, margin, 719, 235);
  drawCommercialIdentityFields(commands, fields.right, 337, 719, 216);
}

function drawInvoiceSummary(
  commands: string[],
  model: TenantInvoicePdfModel,
  y: number,
) {
  drawCommercialText(commands, "PAYMENT INSTRUCTIONS", margin, y - 4, {
    bold: true,
    color: commercialPdfColors.muted,
    fontSize: 6.8,
    width: 245,
  });
  const instructionLines = wrapCommercialText(
    model.paymentInstructions,
    245,
    8,
  );
  instructionLines.forEach((line, index) => {
    drawCommercialText(commands, line, margin, y - 19 - index * 10, {
      fontSize: 8,
      width: 245,
    });
  });
  if (model.note) {
    const noteY = y - 31 - instructionLines.length * 10;
    drawCommercialText(commands, "NOTE", margin, noteY, {
      bold: true,
      color: commercialPdfColors.muted,
      fontSize: 6.8,
      width: 245,
    });
    wrapCommercialText(model.note, 245, 8).forEach((line, index) => {
      drawCommercialText(commands, line, margin, noteY - 15 - index * 10, {
        fontSize: 8,
        width: 245,
      });
    });
  }
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

function invoiceIdentityFields(model: TenantInvoicePdfModel) {
  return {
    left: [
      { label: "BILL TO", value: model.recipientLabel },
      {
        label: "PROPERTY",
        value: [model.propertyLabel, model.unitLabel].filter(Boolean).join(" / "),
      },
      {
        label: "OCCUPANTS",
        value: model.occupantLabels.length
          ? model.occupantLabels.join(", ")
          : "-",
      },
    ],
    right: [
      { label: "ISSUE DATE", value: formatCommercialDate(model.issueDate) },
      { label: "DUE DATE", value: formatCommercialDate(model.dueDate) },
      {
        label: "BILLING PERIOD",
        value: `${formatCommercialDate(model.billingPeriodStart)} - ${formatCommercialDate(model.billingPeriodEnd)}`,
      },
    ],
  };
}

function invoiceSummaryHeight(model: TenantInvoicePdfModel) {
  const instructionLines = wrapCommercialText(
    model.paymentInstructions,
    245,
    8,
  ).length;
  const noteLines = model.note
    ? wrapCommercialText(model.note, 245, 8).length
    : 0;
  return Math.max(88, 42 + instructionLines * 10 + noteLines * 10);
}
