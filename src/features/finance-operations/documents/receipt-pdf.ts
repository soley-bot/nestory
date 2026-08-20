import type { TenantReceiptPdfModel } from "@/features/finance-operations/documents/commercial-document.types";
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

type ReceiptRow = { amount: string; height: number; lines: string[] };

const margin = 42;
const contentWidth = 511;
const tableBottom = 112;
const maximumFirstTableTop = 548;
const continuedTableTop = 692;
const tableHeaderHeight = 25;
const descriptionWidth = 359;
const amountWidth = contentWidth - descriptionWidth;

export function buildTenantReceiptPdf(model: TenantReceiptPdfModel): Uint8Array {
  const identity = receiptIdentityFields(model);
  const firstTableTop = Math.min(
    maximumFirstTableTop,
    getCommercialIdentityBottom(identity.left, 719, 235) - 18,
    getCommercialIdentityBottom(identity.right, 719, 216) - 18,
  );
  const rows = model.allocations.map((allocation) => {
    const lines = wrapCommercialText(
      allocation.label,
      descriptionWidth - 20,
      8.5,
    );
    return {
      amount: formatCommercialMoney(allocation.amount, model.currency),
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
  if (lastTop - tableHeaderHeight - lastUsedHeight - tableBottom < 178) {
    pages.push([]);
  }

  const pageContents = pages.map((pageRows, pageIndex) =>
    renderReceiptPage(
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

function renderReceiptPage(
  model: TenantReceiptPdfModel,
  rows: ReceiptRow[],
  pageIndex: number,
  totalPages: number,
  firstTableTop: number,
) {
  const commands: string[] = [];
  drawReceiptHeader(commands, model, pageIndex > 0);
  if (pageIndex === 0) drawReceiptIdentity(commands, model);
  const tableTop = pageIndex === 0 ? firstTableTop : continuedTableTop;
  drawCommercialTwoColumnTableHeader(commands, {
    amountWidth,
    contentWidth,
    descriptionWidth,
    leftLabel: "PAYMENT ALLOCATION",
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
  if (pageIndex === totalPages - 1) drawReceiptBalances(commands, model, y - 15);
  drawReceiptFooter(commands, model, pageIndex + 1, totalPages);
  return commands.join("\n");
}

function drawReceiptHeader(
  commands: string[],
  model: TenantReceiptPdfModel,
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
  drawCommercialText(commands, "PAYMENT RECEIPT", 300, 786, {
    align: "right",
    bold: true,
    fontSize: 22,
    width: 253,
  });
  drawCommercialText(commands, model.receiptNumber, 350, 769, {
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
  if (model.reversed) drawStatus(commands, "REVERSED");
}

function drawReceiptIdentity(commands: string[], model: TenantReceiptPdfModel) {
  const fields = receiptIdentityFields(model);
  drawCommercialIdentityFields(commands, fields.left, margin, 719, 235);
  drawCommercialIdentityFields(commands, fields.right, 337, 719, 216);
}

function drawReceiptBalances(
  commands: string[],
  model: TenantReceiptPdfModel,
  yTop: number,
) {
  const balances = [
    ["INVOICE TOTAL", model.invoiceTotal],
    ["PREVIOUSLY PAID", model.amountPreviouslyPaid],
    ["THIS PAYMENT", model.paymentAmount],
    ["REMAINING BALANCE", model.remainingBalance],
  ] as const;
  let y = yTop;
  balances.forEach(([label, amount], index) => {
    const isFinal = index === balances.length - 1;
    drawCommercialRect(commands, 297, y - 30, 256, 30, {
      fill: isFinal ? commercialPdfColors.strong : commercialPdfColors.soft,
      stroke: isFinal ? commercialPdfColors.strong : commercialPdfColors.border,
    });
    drawCommercialText(commands, label, 309, y - 19, {
      bold: true,
      color: isFinal ? "#ffffff" : commercialPdfColors.muted,
      fontSize: 7.5,
      width: 113,
    });
    drawCommercialText(
      commands,
      formatCommercialMoney(amount, model.currency),
      424,
      y - 20,
      {
        align: "right",
        bold: true,
        color: isFinal ? "#ffffff" : commercialPdfColors.ink,
        fontSize: isFinal ? 11 : 9,
        width: 117,
      },
    );
    y -= 30;
  });
}

function drawReceiptFooter(
  commands: string[],
  model: TenantReceiptPdfModel,
  pageNumber: number,
  totalPages: number,
) {
  drawCommercialLine(commands, margin, 55, 553, 55);
  drawCommercialText(
    commands,
    "PAYMENT RECEIPT - NOT A TAX RECEIPT",
    margin,
    36,
    { bold: true, color: commercialPdfColors.muted, fontSize: 7 },
  );
  drawCommercialText(commands, model.issuer.name, 235, 36, {
    align: "center",
    color: commercialPdfColors.muted,
    fontSize: 7,
    width: 173,
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

function receiptIdentityFields(model: TenantReceiptPdfModel) {
  return {
    left: [
      { label: "RECEIVED FROM", value: model.recipientLabel },
      {
        label: "PROPERTY",
        value: [model.propertyLabel, model.unitLabel].filter(Boolean).join(" / "),
      },
      {
        label: "PAYMENT RECEIVED",
        value: formatCommercialMoney(model.paymentAmount, model.currency),
      },
    ],
    right: [
      {
        label: "PAYMENT DATE",
        value: formatCommercialDate(model.paymentDate),
      },
      {
        label: "PUBLICATION DATE",
        value: formatCommercialDate(model.publicationDate),
      },
      { label: "INVOICE", value: model.invoiceNumber },
      { label: "REFERENCE", value: model.paymentReference ?? "-" },
    ],
  };
}
