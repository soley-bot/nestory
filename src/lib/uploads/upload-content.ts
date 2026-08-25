import sharp from "sharp";

export type UploadContentType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

type UploadContentValidationResult =
  | {
      bytes: Uint8Array;
      contentType: UploadContentType;
      height?: number;
      ok: true;
      width?: number;
    }
  | {
      ok: false;
      reason: "extension_mismatch" | "invalid_content" | "type_mismatch";
    };

export async function validateUploadedFileContent(
  file: File,
  allowedContentTypes: readonly UploadContentType[],
): Promise<UploadContentValidationResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectUploadContent(bytes);

  if (!detected) {
    return { ok: false, reason: "invalid_content" };
  }

  if (
    detected.contentType !== file.type
    || !allowedContentTypes.includes(detected.contentType)
  ) {
    return { ok: false, reason: "type_mismatch" };
  }

  if (!extensionMatches(file.name, detected.contentType)) {
    return { ok: false, reason: "extension_mismatch" };
  }

  if (
    detected.contentType !== "application/pdf"
    && !(await isDecodableImage(bytes, detected))
  ) {
    return { ok: false, reason: "invalid_content" };
  }

  return {
    bytes,
    contentType: detected.contentType,
    height: detected.height,
    ok: true,
    width: detected.width,
  };
}

type DetectedContent = {
  contentType: UploadContentType;
  height?: number;
  width?: number;
};

function detectUploadContent(bytes: Uint8Array): DetectedContent | null {
  return detectPdf(bytes)
    ?? detectPng(bytes)
    ?? detectJpeg(bytes)
    ?? detectWebp(bytes);
}

async function isDecodableImage(bytes: Uint8Array, detected: DetectedContent) {
  try {
    const { info } = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .raw()
      .toBuffer({ resolveWithObject: true });

    return info.width === detected.width && info.height === detected.height;
  } catch {
    return false;
  }
}

function detectPdf(bytes: Uint8Array): DetectedContent | null {
  if (
    bytes.length < 14
    || ascii(bytes, 0, 5) !== "%PDF-"
    || bytes[5] < 0x31
    || bytes[5] > 0x32
    || bytes[6] !== 0x2e
    || bytes[7] < 0x30
    || bytes[7] > 0x39
  ) {
    return null;
  }

  const source = new TextDecoder("latin1").decode(bytes);
  const terminalXref = /startxref[\t \r\n]+(\d+)[\t \r\n]+%%EOF[\0\t\n\f\r ]*$/.exec(source);
  if (!terminalXref || terminalXref.index <= 0) return null;

  const xrefOffset = Number(terminalXref[1]);
  if (
    !Number.isSafeInteger(xrefOffset)
    || xrefOffset <= 0
    || xrefOffset >= terminalXref.index
  ) {
    return null;
  }

  return hasClassicPdfXref(source, xrefOffset, terminalXref.index)
    || hasPdfXrefStream(source, xrefOffset, terminalXref.index)
    ? { contentType: "application/pdf" }
    : null;
}

function hasClassicPdfXref(source: string, xrefOffset: number, startxrefOffset: number) {
  const section = source.slice(xrefOffset, startxrefOffset);
  if (!/^xref(?:[\t \r\n])/.test(section)) return false;

  const trailerOffset = section.lastIndexOf("trailer");
  if (trailerOffset < 0) return false;
  const xref = section.slice(0, trailerOffset);
  const trailer = section.slice(trailerOffset + "trailer".length);
  const hasSubsection = /(?:^|[\r\n])\s*\d+\s+\d+\s*(?:[\r\n])/.test(xref);
  const hasEntry = /(?:^|[\r\n])\d{10}\s+\d{5}\s+[fn](?:\s|$)/.test(xref);
  const root = pdfRootReference(trailer);

  return hasSubsection
    && hasEntry
    && /\/Size\s+\d+\b/.test(trailer)
    && root !== null
    && hasPdfObject(source.slice(0, xrefOffset), root.objectId, root.generation);
}

function hasPdfXrefStream(source: string, xrefOffset: number, startxrefOffset: number) {
  const section = source.slice(xrefOffset, startxrefOffset);
  const object = /^(\d+)\s+(\d+)\s+obj\b/.exec(section);
  if (!object) return false;

  const streamOffset = section.indexOf("stream", object[0].length);
  const endStreamOffset = section.indexOf("endstream", streamOffset + 6);
  const endObjectOffset = section.indexOf("endobj", endStreamOffset + 9);
  if (streamOffset < 0 || endStreamOffset < 0 || endObjectOffset < 0) return false;

  const dictionary = section.slice(object[0].length, streamOffset);
  const streamData = section.slice(streamOffset + "stream".length, endStreamOffset)
    .replace(/^[\r\n]+|[\r\n]+$/g, "");
  return /\/Type\s*\/XRef\b/.test(dictionary)
    && /\/Size\s+\d+\b/.test(dictionary)
    && /\/Length\s+\d+\b/.test(dictionary)
    && /\/W\s*\[\s*\d+\s+\d+\s+\d+\s*\]/.test(dictionary)
    && streamData.length > 0
    && pdfRootReference(dictionary) !== null;
}

function pdfRootReference(source: string) {
  const match = /\/Root\s+(\d+)\s+(\d+)\s+R\b/.exec(source);
  return match
    ? { generation: Number(match[2]), objectId: Number(match[1]) }
    : null;
}

function hasPdfObject(source: string, objectId: number, generation: number) {
  const object = new RegExp(
    `(?:^|[\\r\\n])\\s*${objectId}\\s+${generation}\\s+obj\\b`,
  );
  return object.test(source);
}

function detectPng(bytes: Uint8Array): DetectedContent | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 45
    || signature.some((value, index) => bytes[index] !== value)
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunkIndex = 0;
  let hasImageData = false;
  let width = 0;
  let height = 0;

  while (offset + 12 <= bytes.length) {
    const dataLength = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.length) return null;

    if (chunkIndex === 0) {
      if (type !== "IHDR" || dataLength !== 13) return null;
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (
        width === 0
        || height === 0
        || bytes[offset + 18] !== 0
        || bytes[offset + 19] !== 0
        || ![0, 1].includes(bytes[offset + 20])
      ) {
        return null;
      }
    } else if (type === "IHDR") {
      return null;
    }

    if (type === "IDAT") {
      if (dataLength === 0) return null;
      hasImageData = true;
    }

    if (type === "IEND") {
      return dataLength === 0 && hasImageData && chunkEnd === bytes.length
        ? { contentType: "image/png", height, width }
        : null;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  return null;
}

function detectJpeg(bytes: Uint8Array): DetectedContent | null {
  if (
    bytes.length < 23
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let hasScan = false;
  let width = 0;
  let height = 0;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      return hasScan && width > 0 && height > 0 && offset === bytes.length
        ? { contentType: "image/jpeg", height, width }
        : null;
    }

    if (marker === 0x00 || marker === 0xd8 || isStandaloneJpegMarker(marker)) {
      return null;
    }
    if (offset + 2 > bytes.length) return null;

    const segmentLength = view.getUint16(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) return null;

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 8) return null;
      height = view.getUint16(offset + 3);
      width = view.getUint16(offset + 5);
      if (width === 0 || height === 0) return null;
    }

    if (marker !== 0xda) {
      offset = segmentEnd;
      continue;
    }

    if (width === 0 || height === 0 || segmentLength < 6) return null;
    hasScan = true;
    offset = segmentEnd;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const markerStart = offset;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;

      const scanMarker = bytes[offset];
      if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
        offset += 1;
        continue;
      }
      if (scanMarker === 0xd9) {
        return offset + 1 === bytes.length
          ? { contentType: "image/jpeg", height, width }
          : null;
      }

      offset = markerStart;
      break;
    }
  }

  return null;
}

function detectWebp(bytes: Uint8Array): DetectedContent | null {
  if (
    bytes.length < 30
    || ascii(bytes, 0, 4) !== "RIFF"
    || ascii(bytes, 8, 4) !== "WEBP"
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8) return null;

  let offset = 12;
  let chunkIndex = 0;
  let hasImage = false;
  let width: number | undefined;
  let height: number | undefined;

  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const dataLength = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + dataLength;
    const paddedEnd = chunkEnd + (dataLength % 2);
    if (chunkEnd > bytes.length || paddedEnd > bytes.length) return null;

    if (chunkIndex === 0 && !["VP8 ", "VP8L", "VP8X"].includes(type)) {
      return null;
    }

    if (type === "VP8 ") {
      if (
        dataLength < 10
        || bytes[dataStart + 3] !== 0x9d
        || bytes[dataStart + 4] !== 0x01
        || bytes[dataStart + 5] !== 0x2a
      ) {
        return null;
      }
      width = view.getUint16(dataStart + 6, true) & 0x3fff;
      height = view.getUint16(dataStart + 8, true) & 0x3fff;
      hasImage = width > 0 && height > 0;
    } else if (type === "VP8L") {
      if (dataLength < 5 || bytes[dataStart] !== 0x2f) return null;
      const bits = view.getUint32(dataStart + 1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      hasImage = true;
    } else if (type === "VP8X") {
      if (dataLength !== 10) return null;
      width = uint24LittleEndian(bytes, dataStart + 4) + 1;
      height = uint24LittleEndian(bytes, dataStart + 7) + 1;
    }

    offset = paddedEnd;
    chunkIndex += 1;
  }

  return offset === bytes.length && hasImage
    ? { contentType: "image/webp", height, width }
    : null;
}

function extensionMatches(fileName: string, contentType: UploadContentType) {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  const allowedExtensions: Record<UploadContentType, readonly string[]> = {
    "application/pdf": ["pdf"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
  };
  return extension !== undefined && allowedExtensions[contentType].includes(extension);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) return "";
  let value = "";
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function isJpegStartOfFrame(marker: number) {
  return marker >= 0xc0
    && marker <= 0xcf
    && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function isStandaloneJpegMarker(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function uint24LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
