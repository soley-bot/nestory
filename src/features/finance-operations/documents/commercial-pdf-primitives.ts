import { commercialUnicodeFontBase64 } from "@/features/finance-operations/documents/commercial-unicode-font";

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

export type CommercialPdfIdentityField = {
  label: string;
  value: string;
};

export const commercialA4Portrait = { height: 842, width: 595 } as const;

const commercialPdfSupportMessage =
  "Tenant commercial PDFs support basic Latin text and USD only.";

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
  imageAssets.forEach(validateCommercialImage);
  const unicodeFont = buildCommercialUnicodeFont();
  const firstPageObjectId = 11;
  const firstImageObjectId = firstPageObjectId + pageContents.length * 2;
  const maxObjectId = firstImageObjectId + imageAssets.length - 1;
  const objects: Array<Buffer | string> = new Array(maxObjectId + 1);
  const pageRefs = pageContents
    .map((_, index) => `${firstPageObjectId + index * 2} 0 R`)
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
  objects[5] =
    "<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansKhmer /Encoding /Identity-H " +
    "/DescendantFonts [6 0 R] /ToUnicode 10 0 R >>";
  objects[6] =
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansKhmer " +
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
    `/FontDescriptor 7 0 R /DW 600 /W [6016 [${unicodeFont.khmerWidths.join(" ")}]] ` +
    "/CIDToGIDMap 9 0 R >>";
  objects[7] =
    "<< /Type /FontDescriptor /FontName /NotoSansKhmer /Flags 4 " +
    `/FontBBox [${unicodeFont.fontBox.join(" ")}] /ItalicAngle 0 ` +
    `/Ascent ${unicodeFont.ascent} /Descent ${unicodeFont.descent} ` +
    "/CapHeight 714 /StemV 80 /FontFile2 8 0 R >>";
  objects[8] = binaryStream(unicodeFont.bytes, {
    Length1: unicodeFont.bytes.byteLength,
  });
  objects[9] = binaryStream(unicodeFont.cidToGidMap);
  objects[10] = textStream(unicodeToUnicodeCMap());

  pageContents.forEach((content, index) => {
    const pageObjectId = firstPageObjectId + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${commercialA4Portrait.width} ${commercialA4Portrait.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${imageResources} >> ` +
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
  if (/[^\x20-\x7e]/.test(text)) {
    throw new Error(commercialPdfSupportMessage);
  }
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

export function getCommercialIdentityBottom(
  fields: CommercialPdfIdentityField[],
  top: number,
  width: number,
) {
  return fields.reduce((y, field) => {
    const lineCount = wrapCommercialText(field.value, width, 9.5).length;
    return y - 40 - Math.max(0, lineCount - 1) * 11;
  }, top);
}

export function drawCommercialIdentityFields(
  commands: string[],
  fields: CommercialPdfIdentityField[],
  x: number,
  top: number,
  width: number,
) {
  let y = top;
  fields.forEach((field) => {
    drawCommercialText(commands, field.label, x, y, {
      bold: true,
      color: commercialPdfColors.muted,
      fontSize: 6.8,
      width,
    });
    const lines = wrapCommercialText(field.value, width, 9.5);
    lines.forEach((line, index) => {
      drawCommercialText(commands, line, x, y - 16 - index * 11, {
        bold: true,
        fontSize: 9.5,
        width,
      });
    });
    y -= 40 + Math.max(0, lines.length - 1) * 11;
  });
  return y;
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

export function paginateCommercialTableRows(
  rows: CommercialPdfTwoColumnRow[],
  options: {
    firstTableTop: number;
    tableBottom: number;
    tableHeaderHeight: number;
    continuedTableTop: number;
  },
) {
  const pages: CommercialPdfTwoColumnRow[][] = [[]];
  let pageIndex = 0;
  let remaining =
    options.firstTableTop - options.tableHeaderHeight - options.tableBottom;
  for (const row of rows) {
    let lines = [...row.lines];
    let firstFragment = true;
    while (lines.length) {
      const wholeHeight = Math.max(31, lines.length * 11 + 14);
      if (wholeHeight <= remaining) {
        const fragment = {
          ...row,
          amount: firstFragment ? row.amount : "",
          height: wholeHeight,
          lines,
        };
        pages[pageIndex].push(fragment);
        remaining -= fragment.height;
        lines = [];
        continue;
      }

      const maxLines = Math.floor((remaining - 14) / 11);
      if (maxLines < 1) {
        pages.push([]);
        pageIndex += 1;
        remaining =
          options.continuedTableTop -
          options.tableHeaderHeight -
          options.tableBottom;
        continue;
      }

      const fragmentLines = lines.slice(0, maxLines);
      const fragment = {
        ...row,
        amount: firstFragment ? row.amount : "",
        height: Math.max(31, fragmentLines.length * 11 + 14),
        lines: fragmentLines,
      };
      pages[pageIndex].push(fragment);
      lines = lines.slice(fragmentLines.length);
      firstFragment = false;
      pages.push([]);
      pageIndex += 1;
      remaining =
        options.continuedTableTop -
        options.tableHeaderHeight -
        options.tableBottom;
    }
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
  if (currency !== "USD") {
    throw new Error(commercialPdfSupportMessage);
  }
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
    else if (/[\u17b4-\u17d3]/.test(character)) units += 0;
    else if (/[\u1780-\u17ff]/.test(character)) units += 0.62;
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
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
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

function validateCommercialImage(image: CommercialPdfImage) {
  const bytes = image.bytes;
  const jpegMarkers =
    bytes.byteLength >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.byteLength - 2] === 0xff &&
    bytes[bytes.byteLength - 1] === 0xd9;
  if (
    !jpegMarkers ||
    !Number.isFinite(image.width) ||
    image.width <= 0 ||
    !Number.isFinite(image.height) ||
    image.height <= 0
  ) {
    throw new Error("Issuer logo must be a positive-size JPEG image.");
  }
}

function buildCommercialUnicodeFont() {
  const bytes = new Uint8Array(
    Buffer.from(commercialUnicodeFontBase64, "base64"),
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = readTrueTypeTables(view);
  const unitsPerEm = view.getUint16(requiredTable(tables, "head") + 18);
  const head = requiredTable(tables, "head");
  const hhea = requiredTable(tables, "hhea");
  const hmtx = requiredTable(tables, "hmtx");
  const cmap = buildTrueTypeCmap(view, requiredTable(tables, "cmap"));
  const numberOfHMetrics = view.getUint16(hhea + 34);
  const advanceWidth = (glyphId: number) =>
    view.getUint16(hmtx + Math.min(glyphId, numberOfHMetrics - 1) * 4);
  const scale = (value: number) => Math.round((value * 1000) / unitsPerEm);
  const cidToGidMap = new Uint8Array(0x10000 * 2);
  for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
    const glyphId = cmap(codePoint);
    cidToGidMap[codePoint * 2] = glyphId >> 8;
    cidToGidMap[codePoint * 2 + 1] = glyphId & 0xff;
  }
  const khmerWidths = Array.from({ length: 0x80 }, (_, index) =>
    scale(advanceWidth(cmap(0x1780 + index))),
  );
  return {
    ascent: scale(view.getInt16(hhea + 4)),
    bytes,
    cidToGidMap,
    descent: scale(view.getInt16(hhea + 6)),
    fontBox: [
      scale(view.getInt16(head + 36)),
      scale(view.getInt16(head + 38)),
      scale(view.getInt16(head + 40)),
      scale(view.getInt16(head + 42)),
    ],
    khmerWidths,
  };
}

function readTrueTypeTables(view: DataView) {
  const tables = new Map<string, number>();
  const tableCount = view.getUint16(4);
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    tables.set(tag, view.getUint32(record + 8));
  }
  return tables;
}

function requiredTable(tables: Map<string, number>, tag: string) {
  const offset = tables.get(tag);
  if (offset === undefined) throw new Error(`Unicode font is missing ${tag}.`);
  return offset;
}

function buildTrueTypeCmap(view: DataView, cmapOffset: number) {
  const count = view.getUint16(cmapOffset + 2);
  let format4Offset: number | null = null;
  for (let index = 0; index < count; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmapOffset + view.getUint32(record + 4);
    if (
      view.getUint16(offset) === 4 &&
      (platform === 0 || (platform === 3 && encoding === 1))
    ) {
      format4Offset = offset;
      if (platform === 3) break;
    }
  }
  if (format4Offset === null) {
    throw new Error("Unicode font is missing a BMP character map.");
  }
  const offset = format4Offset;
  const segmentCount = view.getUint16(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segmentCount * 2 + 2;
  const deltas = startCodes + segmentCount * 2;
  const rangeOffsets = deltas + segmentCount * 2;
  return (codePoint: number) => {
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const end = view.getUint16(endCodes + segment * 2);
      if (codePoint > end) continue;
      const start = view.getUint16(startCodes + segment * 2);
      if (codePoint < start) return 0;
      const delta = view.getInt16(deltas + segment * 2);
      const rangePosition = rangeOffsets + segment * 2;
      const rangeOffset = view.getUint16(rangePosition);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyphPosition =
        rangePosition + rangeOffset + (codePoint - start) * 2;
      const glyph = view.getUint16(glyphPosition);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function binaryStream(
  bytes: Uint8Array,
  entries: Record<string, number> = {},
) {
  const dictionary = Object.entries(entries)
    .map(([key, value]) => `/${key} ${value}`)
    .join(" ");
  return Buffer.concat([
    Buffer.from(
      `<< /Length ${bytes.byteLength}${dictionary ? ` ${dictionary}` : ""} >>\nstream\n`,
      "latin1",
    ),
    Buffer.from(bytes),
    Buffer.from("\nendstream", "latin1"),
  ]);
}

function textStream(value: string) {
  return `<< /Length ${Buffer.byteLength(value, "latin1")} >>\nstream\n${value}\nendstream`;
}

function unicodeToUnicodeCMap() {
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /NotoSansKhmer-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "1 beginbfrange",
    "<0000> <FFFF> <0000>",
    "endbfrange",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
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
