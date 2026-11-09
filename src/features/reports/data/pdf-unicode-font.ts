import { deflateSync } from "node:zlib";
import { create, type Font } from "fontkit";
import { commercialUnicodeFontBase64 } from "@/features/finance-operations/documents/commercial-unicode-font";

let loadedFont: { bytes: Buffer; font: Font } | undefined;

function unicodeFont() {
  if (!loadedFont) {
    const bytes = Buffer.from(commercialUnicodeFontBase64, "base64");
    const font = create(bytes);
    if (font.type !== "TTF") throw new Error("The report font must be TrueType.");
    loadedFont = { bytes, font };
  }
  return loadedFont;
}

export class UnsupportedReportTextError extends Error {
  constructor() {
    super("This PDF font cannot display some report text. Download Excel to preserve the original names.");
  }
}

export function needsUnicodeFont(text: string) {
  return /[^\x20-\x7e]/.test(text);
}

function layout(text: string) {
  const { font } = unicodeFont();
  for (const character of text) {
    // Join controls affect shaping but do not have visible glyphs.
    if (!/[\u200c\u200d]/.test(character) && !font.hasGlyphForCodePoint(character.codePointAt(0)!)) {
      throw new UnsupportedReportTextError();
    }
  }
  // Detection otherwise chooses Latin for labels such as "Owner: សុខា" and
  // skips Khmer substitutions. The bundled font supports both in a Khmer run.
  return font.layout(text, undefined, /\p{Script=Khmer}/u.test(text) ? "khmr" : undefined);
}

export function unicodeTextWidth(text: string, fontSize: number) {
  return layout(text).advanceWidth * fontSize / unicodeFont().font.unitsPerEm;
}

export function unicodeTextCommands(text: string, x: number, y: number, fontSize: number) {
  const run = layout(text);
  const scale = fontSize / unicodeFont().font.unitsPerEm;
  // ActualText retains logical order for copy/search, including Khmer ligatures.
  const commands = [`/Span << /ActualText <FEFF${utf16Hex(text)}> >> BDC`, `BT /F3 ${fontSize} Tf`];
  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index]!;
    commands.push(`1 0 0 1 ${round(x + position.xOffset * scale)} ${round(y + position.yOffset * scale)} Tm <${glyph.id.toString(16).padStart(4, "0")}> Tj`);
    x += position.xAdvance * scale;
    y += position.yAdvance * scale;
  });
  commands.push("ET", "EMC");
  return commands;
}

export function unicodeFontObjects(firstId: number): Array<Buffer | string> {
  const { font, bytes } = unicodeFont();
  const scale = 1000 / font.unitsPerEm;
  const box = [font.bbox.minX, font.bbox.minY, font.bbox.maxX, font.bbox.maxY].map(value => round(value * scale));
  const widths = Array.from({ length: font.numGlyphs }, (_, id) => round(font.getGlyph(id).advanceWidth * scale));
  const mappings = new Map<number, string>();
  for (const codePoint of font.characterSet) {
    const id = font.glyphForCodePoint(codePoint).id;
    if (!mappings.has(id)) mappings.set(id, utf16Hex(String.fromCodePoint(codePoint)));
  }
  const entries = [...mappings].map(([id, text]) => `<${id.toString(16).padStart(4, "0")}> <${text}>`);
  const cmap = [
    "/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /NestoryReport-UCS def", "/CMapType 2 def",
    "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange",
  ];
  for (let index = 0; index < entries.length; index += 100) {
    const chunk = entries.slice(index, index + 100);
    cmap.push(`${chunk.length} beginbfchar`, ...chunk, "endbfchar");
  }
  cmap.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  return [
    `<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansKhmer /Encoding /Identity-H /DescendantFonts [${firstId + 1} 0 R] /ToUnicode ${firstId + 4} 0 R >>`,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansKhmer /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${firstId + 2} 0 R /W [0 [${widths.join(" ")}]] /CIDToGIDMap /Identity >>`,
    `<< /Type /FontDescriptor /FontName /NotoSansKhmer /Flags 4 /FontBBox [${box.join(" ")}] /ItalicAngle 0 /Ascent ${round(font.ascent * scale)} /Descent ${round(font.descent * scale)} /CapHeight ${round(font.capHeight * scale)} /StemV 80 /FontFile2 ${firstId + 3} 0 R >>`,
    stream(deflateSync(bytes), `/Filter /FlateDecode /Length1 ${bytes.byteLength}`),
    stream(Buffer.from(cmap.join("\n"), "ascii")),
  ];
}

function stream(bytes: Buffer, attributes = "") {
  return Buffer.concat([
    Buffer.from(`<< /Length ${bytes.byteLength} ${attributes} >>\nstream\n`, "ascii"),
    bytes, Buffer.from("\nendstream", "ascii"),
  ]);
}

function utf16Hex(text: string) {
  return Buffer.from(text, "utf16le").swap16().toString("hex").toUpperCase();
}

function round(value: number) {
  return Number(value.toFixed(3));
}
