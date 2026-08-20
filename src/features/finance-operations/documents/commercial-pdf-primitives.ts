export type CommercialPdfImage = {
  bytes: Uint8Array;
  height: number;
  name: string;
  width: number;
};

export type CommercialPdfTextOptions = {
  align?: "center" | "left" | "right";
  bold?: boolean;
  color?: string;
  fontSize?: number;
  width?: number;
};

export type CommercialPdfTwoColumnRow = {
  amount: string;
  height: number;
  lines: string[];
};

export const commercialA4Portrait = { height: 842, width: 595 } as const;

export const commercialPdfColors = {
  border: "#c8cdd2",
  ink: "#202428",
  muted: "#656b70",
  paper: "#ffffff",
  soft: "#f2f3f4",
  strong: "#3b4044",
};

export function buildCommercialPdf(
  pageContents: string[],
  imageAssets: CommercialPdfImage[] = [],
) {
  const firstImageObjectId = 5 + pageContents.length * 2;
  const maxObjectId = firstImageObjectId + imageAssets.length - 1;
  const objects: Array<Buffer | string> = new Array(maxObjectId + 1);
  const pageRefs = pageContents
    .map((_, index) => `${5 + index * 2} 0 R`)
    .join(" ");
  const imageResources = imageAssets.length
    ? ` /XObject << ${imageAssets
        .map(
          (asset, index) =>
            `/${asset.name} ${firstImageObjectId + index} 0 R`,
        )
        .join(" ")} >>`
    : "";

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageContents.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pageContents.forEach((content, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${commercialA4Portrait.width} ${commercialA4Portrait.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${imageResources} >> ` +
      `/Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  imageAssets.forEach((asset, index) => {
    const header = Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${asset.width} /Height ${asset.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${asset.bytes.byteLength} >>\nstream\n`,
      "latin1",
    );
    objects[firstImageObjectId + index] = Buffer.concat([
      header,
      Buffer.from(asset.bytes),
      Buffer.from("\nendstream", "latin1"),
    ]);
  });

  const parts = [Buffer.from("%PDF-1.4\n", "latin1")];
  let byteLength = parts[0].byteLength;
  const offsets = [0];

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    const source = objects[objectId];
    if (!source) throw new Error(`PDF object ${objectId} is missing.`);
    offsets[objectId] = byteLength;
    const object = Buffer.concat([
      Buffer.from(`${objectId} 0 obj\n`, "latin1"),
      typeof source === "string" ? Buffer.from(source, "latin1") : source,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(object);
    byteLength += object.byteLength;
  }

  const xrefOffset = byteLength;
  let trailer = `xref\n0 ${maxObjectId + 1}\n0000000000 65535 f \n`;
  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    trailer += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  trailer +=
    `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(trailer, "latin1"));

  return new Uint8Array(Buffer.concat(parts));
}

export function drawCommercialImage(
  commands: string[],
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  commands.push(
    `q ${round(width)} 0 0 ${round(height)} ${round(x)} ${round(y)} cm /${name} Do Q`,
  );
}

export function drawCommercialLine(
  commands: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = commercialPdfColors.border,
  width = 0.5,
) {
  commands.push(
    `${round(width)} w`,
    `${toRgb(color)} RG`,
    `${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`,
  );
}

export function drawCommercialRect(
  commands: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: string; lineWidth?: number; stroke?: string } = {},
) {
  commands.push(`${round(options.lineWidth ?? 0.5)} w`);
  if (options.fill) commands.push(`${toRgb(options.fill)} rg`);
  if (options.stroke) commands.push(`${toRgb(options.stroke)} RG`);
  commands.push(`${round(x)} ${round(y)} ${round(width)} ${round(height)} re`);
  commands.push(
    options.fill && options.stroke ? "B" : options.fill ? "f" : "S",
  );
}

export function drawCommercialText(
  commands: string[],
  value: string,
  x: number,
  y: number,
  options: CommercialPdfTextOptions = {},
) {
  const fontSize = options.fontSize ?? 9;
  const text = sanitizeCommercialText(value);
  const width = options.width ?? 0;
  const offset =
    options.align === "right"
      ? Math.max(0, width - estimateCommercialTextWidth(text, fontSize, options.bold))
      : options.align === "center"
        ? Math.max(
            0,
            (width - estimateCommercialTextWidth(text, fontSize, options.bold)) / 2,
          )
        : 0;
  commands.push(
    `${toRgb(options.color ?? commercialPdfColors.ink)} rg`,
    `BT /${options.bold ? "F2" : "F1"} ${round(fontSize)} Tf 1 0 0 1 ` +
      `${round(x + offset)} ${round(y)} Tm (${escapePdfString(text)}) Tj ET`,
  );
}

export function drawCommercialTwoColumnTableHeader(
  commands: string[],
  options: {
    amountWidth: number;
    contentWidth: number;
    descriptionWidth: number;
    leftLabel: string;
    margin: number;
    rightLabel: string;
    tableHeaderHeight: number;
    yTop: number;
  },
) {
  drawCommercialRect(
    commands,
    options.margin,
    options.yTop - options.tableHeaderHeight,
    options.contentWidth,
    options.tableHeaderHeight,
    { fill: commercialPdfColors.strong },
  );
  drawCommercialText(
    commands,
    options.leftLabel,
    options.margin + 10,
    options.yTop - 16,
    { bold: true, color: "#ffffff", fontSize: 7.5 },
  );
  drawCommercialText(
    commands,
    options.rightLabel,
    options.margin + options.descriptionWidth + 10,
    options.yTop - 16,
    {
      align: "right",
      bold: true,
      color: "#ffffff",
      fontSize: 7.5,
      width: options.amountWidth - 20,
    },
  );
}

export function drawCommercialTwoColumnTableRow(
  commands: string[],
  row: CommercialPdfTwoColumnRow,
  options: {
    amountWidth: number;
    contentWidth: number;
    descriptionWidth: number;
    index: number;
    margin: number;
    y: number;
  },
) {
  drawCommercialRect(
    commands,
    options.margin,
    options.y,
    options.contentWidth,
    row.height,
    {
      fill:
        options.index % 2
          ? commercialPdfColors.soft
          : commercialPdfColors.paper,
      stroke: commercialPdfColors.border,
    },
  );
  drawCommercialLine(
    commands,
    options.margin + options.descriptionWidth,
    options.y,
    options.margin + options.descriptionWidth,
    options.y + row.height,
  );
  row.lines.forEach((line, lineIndex) => {
    drawCommercialText(
      commands,
      line,
      options.margin + 10,
      options.y + row.height - 17 - lineIndex * 11,
      { fontSize: 8.5, width: options.descriptionWidth - 20 },
    );
  });
  drawCommercialText(
    commands,
    row.amount,
    options.margin + options.descriptionWidth + 10,
    options.y + row.height - 17,
    {
      align: "right",
      fontSize: 8.5,
      width: options.amountWidth - 20,
    },
  );
}

export function paginateCommercialTableRows<T extends { height: number }>(
  rows: T[],
  options: {
    firstTableTop: number;
    tableBottom: number;
    tableHeaderHeight: number;
    continuedTableTop: number;
  },
) {
  const pages: T[][] = [[]];
  let pageIndex = 0;
  let remaining =
    options.firstTableTop - options.tableHeaderHeight - options.tableBottom;
  for (const row of rows) {
    if (pages[pageIndex].length && row.height > remaining) {
      pages.push([]);
      pageIndex += 1;
      remaining =
        options.continuedTableTop -
        options.tableHeaderHeight -
        options.tableBottom;
    }
    pages[pageIndex].push(row);
    remaining -= row.height;
  }
  return pages;
}

export function fitCommercialImage(
  image: { height: number; width: number },
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { height: image.height * scale, width: image.width * scale };
}

export function formatCommercialDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(match[2]) - 1];
  return month
    ? `${match[3]} ${month} ${match[1]}`
    : value;
}

export function formatCommercialMoney(
  amount: string,
  currency: "KHR" | "USD",
) {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(amount.trim());
  if (!match) return `${currency} ${amount}`;
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${match[1]}${grouped}${match[3] ?? ""}`;
}

export function wrapCommercialText(
  value: string,
  maxWidth: number,
  fontSize: number,
) {
  const text = sanitizeCommercialText(value);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words.length ? words : ["-"]) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateCommercialTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (estimateCommercialTextWidth(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const character of word) {
      if (
        chunk &&
        estimateCommercialTextWidth(`${chunk}${character}`, fontSize) > maxWidth
      ) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function estimateCommercialTextWidth(
  value: string,
  fontSize: number,
  bold = false,
) {
  let units = 0;
  for (const character of value) {
    if (character === " ") units += 0.32;
    else if (/[il.,'|]/.test(character)) units += 0.28;
    else if (/[mwMW@#%]/.test(character)) units += 0.82;
    else if (/[A-Z0-9]/.test(character)) units += 0.58;
    else units += 0.5;
  }
  return units * fontSize * (bold ? 1.04 : 1);
}

function sanitizeCommercialText(value: string) {
  return (
    value
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "-"
  );
}

function escapePdfString(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toRgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4]
    .map((index) => round(Number.parseInt(value.slice(index, index + 2), 16) / 255))
    .join(" ");
}

function round(value: number) {
  return Number(value.toFixed(3));
}
