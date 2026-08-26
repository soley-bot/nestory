import { inflateSync } from "node:zlib";

import { readContainedJpegDimensions } from "@/lib/uploads/jpeg-structure";

const MAX_OBJECTS = 20_000;
const MAX_PARSE_DEPTH = 64;
const MAX_TOKENS = 250_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_TOTAL_IMAGE_PIXELS = 200_000_000;
const MAX_DECODED_STREAM_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_DECODED_STREAM_BYTES = 32 * 1024 * 1024;
const SUSPICIOUS_EXPANSION_BYTES = 1024 * 1024;
const MAX_STREAM_EXPANSION_RATIO = 100;

const ACTIVE_KEYS = new Set([
  "AA",
  "AcroForm",
  "AF",
  "EmbeddedFiles",
  "EF",
  "JS",
  "JavaScript",
  "OpenAction",
  "RichMediaContent",
  "RichMediaSettings",
  "XFA",
]);

const ACTIVE_ACTIONS = new Set([
  "GoTo",
  "GoTo3DView",
  "GoToE",
  "GoToR",
  "GoToDp",
  "Hide",
  "ImportData",
  "JavaScript",
  "Launch",
  "Movie",
  "Named",
  "Rendition",
  "RichMediaExecute",
  "ResetForm",
  "SetOCGState",
  "Sound",
  "SubmitForm",
  "Thread",
  "Trans",
  "URI",
]);

const ACTIVE_TYPES = new Set([
  "3D",
  "3DView",
  "Action",
  "EmbeddedFile",
  "FileAttachment",
  "Filespec",
  "Movie",
  "ObjStm",
  "PS",
  "RichMedia",
  "RichMediaAnnotation",
  "RichMediaConfiguration",
  "Screen",
  "Sound",
  "Widget",
]);

type PdfValue =
  | { kind: "array"; values: PdfValue[] }
  | { entries: Map<string, PdfValue>; kind: "dictionary" }
  | { kind: "boolean"; value: boolean }
  | { kind: "name"; value: string }
  | { kind: "null" }
  | { integer: boolean; kind: "number"; value: number }
  | { generation: number; kind: "reference"; objectId: number }
  | { kind: "string" };

type PdfDictionary = Extract<PdfValue, { kind: "dictionary" }>;
type PdfNumber = Extract<PdfValue, { kind: "number" }>;

type XrefEntry = {
  generation: number;
  objectId: number;
  offset: number;
};

type ParsedObject = {
  end: number;
  generation: number;
  objectId: number;
  start: number;
  stream?: Uint8Array;
  value: PdfValue;
};

type ParseBudget = { remainingTokens: number };
type ResourceBudget = {
  remainingDecodedBytes: number;
  remainingImagePixels: number;
};

/**
 * Local containment profile for evidence PDFs. This is deliberately narrower
 * than the full PDF grammar: one classic xref table or fully enumerated xref
 * stream, no incremental revisions, object streams, encryption, repair, or
 * unsupported stream filters.
 * Every declared indirect object is parsed at its xref offset and every stream
 * is bounded by its direct or indirect Length. Semantic inspection happens on
 * parsed names/dictionaries only; string, comment, and stream bytes are never
 * searched as raw text.
 */
export function isContainedPdf(bytes: Uint8Array) {
  try {
    const headerEnd = readHeaderEnd(bytes);
    const terminal = readTerminalXref(bytes);
    if (headerEnd === null || terminal === null) return false;

    const parseBudget = { remainingTokens: MAX_TOKENS };
    const xref = parseXrefSection(bytes, terminal, parseBudget);
    if (!xref || xref.end !== terminal.end) return false;
    if (xref.entries.size === 0 || xref.entries.size > MAX_OBJECTS) return false;
    if (hasAnyKey(xref.trailer, ["Encrypt", "Prev", "XRefStm"])) return false;

    const size = integerValue(xref.trailer.entries.get("Size"));
    const root = referenceValue(xref.trailer.entries.get("Root"));
    if (size === null || size <= 0 || !root) return false;
    if (!referencesResolve(xref.trailer, xref.entries)) return false;

    const highestObjectId = Math.max(...xref.entries.values().map((entry) => entry.objectId));
    if (size <= highestObjectId) return false;

    const cache = new Map<string, ParsedObject>();
    const parsing = new Set<string>();
    const parseObject = (entry: XrefEntry): ParsedObject | null => {
      const key = referenceKey(entry.objectId, entry.generation);
      const cached = cache.get(key);
      if (cached) return cached;
      if (parsing.has(key)) return null;
      parsing.add(key);
      const parsed = parseIndirectObject(
        bytes,
        entry,
        xref.bodyEnd,
        xref.entries,
        parseObject,
        parseBudget,
      );
      parsing.delete(key);
      if (parsed) cache.set(key, parsed);
      return parsed;
    };

    for (const entry of xref.entries.values()) {
      if (!parseObject(entry)) return false;
    }

    const rootObject = cache.get(referenceKey(root.objectId, root.generation));
    if (!rootObject || rootObject.value.kind !== "dictionary") return false;
    if (nameValue(rootObject.value.entries.get("Type")) !== "Catalog") return false;
    if (!rootObject.value.entries.has("Pages")) return false;

    if (!objectsCoverBody(bytes, headerEnd, xref.bodyEnd, [...cache.values()])) {
      return false;
    }

    const contentStreamKeys = findContentStreamKeys(cache);
    const resourceBudget: ResourceBudget = {
      remainingDecodedBytes: MAX_TOTAL_DECODED_STREAM_BYTES,
      remainingImagePixels: MAX_TOTAL_IMAGE_PIXELS,
    };
    for (const object of cache.values()) {
      if (!inspectValue(
        object.value,
        xref.entries,
        cache,
        resourceBudget,
        object.stream,
        contentStreamKeys.has(referenceKey(object.objectId, object.generation)),
      )) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

type TerminalXref = NonNullable<ReturnType<typeof readTerminalXref>>;

function parseXrefSection(
  bytes: Uint8Array,
  terminal: TerminalXref,
  parseBudget: ParseBudget,
) {
  const probe = new PdfParser(
    bytes,
    terminal.xrefOffset,
    terminal.startxrefOffset,
    parseBudget,
  );
  return probe.peekKeyword("xref")
    ? parseClassicXref(bytes, terminal, parseBudget)
    : parseXrefStream(bytes, terminal, parseBudget);
}

function parseClassicXref(
  bytes: Uint8Array,
  terminal: TerminalXref,
  parseBudget: ParseBudget,
) {
  const { xrefOffset } = terminal;
  const parser = new PdfParser(bytes, xrefOffset, bytes.length, parseBudget);
  if (!parser.consumeKeyword("xref")) return null;

  const entries = new Map<string, XrefEntry>();
  const declaredObjectIds = new Set<number>();
  let entryCount = 0;
  while (!parser.peekKeyword("trailer")) {
    const firstObjectId = parser.readUnsignedInteger();
    const count = parser.readUnsignedInteger();
    if (firstObjectId === null || count === null || count <= 0) return null;
    if (firstObjectId + count > MAX_OBJECTS + 1) return null;
    entryCount += count;
    if (entryCount > MAX_OBJECTS + 1) return null;

    for (let index = 0; index < count; index += 1) {
      const offset = parser.readUnsignedInteger();
      const generation = parser.readUnsignedInteger();
      const state = parser.readBareWord();
      if (offset === null || generation === null || !state || !["f", "n"].includes(state)) {
        return null;
      }
      if (generation > 65_535) return null;
      const objectId = firstObjectId + index;
      if (declaredObjectIds.has(objectId)) return null;
      declaredObjectIds.add(objectId);
      if (state === "f") continue;

      const key = referenceKey(objectId, generation);
      if (objectId <= 0 || offset <= 0 || offset >= xrefOffset || entries.has(key)) {
        return null;
      }
      entries.set(key, { generation, objectId, offset });
    }
  }

  if (!parser.consumeKeyword("trailer")) return null;
  const trailer = parser.parseValue();
  if (!trailer || trailer.kind !== "dictionary") return null;
  const size = integerValue(trailer.entries.get("Size"));
  if (
    size === null
    || size <= 0
    || size > MAX_OBJECTS + 1
    || [...declaredObjectIds].some((objectId) => objectId >= size)
  ) {
    return null;
  }
  if (!parser.consumeKeyword("startxref")) return null;
  const repeatedOffset = parser.readUnsignedInteger();
  if (repeatedOffset !== xrefOffset) return null;
  parser.skipWhitespaceOnly();
  if (!parser.consumeRaw("%%EOF")) return null;
  parser.skipWhitespaceOnly();
  if (parser.position !== bytes.length) return null;

  return { bodyEnd: xrefOffset, end: parser.position, entries, trailer };
}

function parseXrefStream(
  bytes: Uint8Array,
  terminal: TerminalXref,
  parseBudget: ParseBudget,
) {
  const parser = new PdfParser(
    bytes,
    terminal.xrefOffset,
    terminal.startxrefOffset,
    parseBudget,
  );
  const objectId = parser.readUnsignedInteger();
  const generation = parser.readUnsignedInteger();
  if (objectId === null || generation === null || !parser.consumeKeyword("obj")) return null;

  const trailer = parser.parseValue();
  if (!trailer || trailer.kind !== "dictionary") return null;
  if (nameValue(trailer.entries.get("Type")) !== "XRef") return null;
  parser.skipWhitespaceAndComments();
  if (!parser.consumeKeyword("stream")) return null;
  while (
    parser.position < terminal.startxrefOffset
    && isHorizontalWhitespace(bytes[parser.position])
  ) {
    parser.position += 1;
  }
  if (!parser.consumeEndOfLine()) return null;

  const length = integerValue(trailer.entries.get("Length"));
  if (
    length === null
    || length < 0
    || parser.position + length > terminal.startxrefOffset
  ) {
    return null;
  }
  const encoded = bytes.slice(parser.position, parser.position + length);
  parser.position += length;
  parser.consumeEndOfLine();
  if (!parser.consumeKeyword("endstream")) return null;
  parser.skipWhitespaceAndComments();
  if (!parser.consumeKeyword("endobj")) return null;
  const xrefObjectEnd = parser.position;
  if (!isWhitespaceOrComments(bytes, xrefObjectEnd, terminal.startxrefOffset)) return null;

  const decoded = decodeXrefStream(encoded, trailer);
  if (!decoded) return null;
  const entries = parseXrefStreamEntries(decoded, trailer, terminal, {
    generation,
    objectId,
  });
  if (!entries) return null;

  const terminalParser = new PdfParser(
    bytes,
    terminal.startxrefOffset,
    bytes.length,
    parseBudget,
  );
  if (!terminalParser.consumeKeyword("startxref")) return null;
  if (terminalParser.readUnsignedInteger() !== terminal.xrefOffset) return null;
  terminalParser.skipWhitespaceOnly();
  if (!terminalParser.consumeRaw("%%EOF")) return null;
  terminalParser.skipWhitespaceOnly();
  if (terminalParser.position !== bytes.length) return null;

  return {
    bodyEnd: terminal.startxrefOffset,
    end: terminalParser.position,
    entries,
    trailer,
  };
}

function decodeXrefStream(encoded: Uint8Array, dictionary: PdfDictionary) {
  if (hasAnyKey(dictionary, ["DecodeParms", "DP"])) return null;
  const filters = readFilters(dictionary.entries.get("Filter"));
  if (!filters) return null;
  const normalized = filters.map(normalizeFilter);
  if (normalized.some((filter) => filter === null)) return null;
  const supported = normalized as string[];
  if (
    supported.length > 2
    || supported.includes("DCTDecode")
    || (
      supported.length === 2
      && !(supported[0] === "ASCIIHexDecode" && supported[1] === "FlateDecode")
    )
  ) {
    return null;
  }

  let decoded = encoded;
  if (supported[0] === "ASCIIHexDecode") {
    const asciiDecoded = decodeAsciiHex(decoded);
    if (!asciiDecoded) return null;
    decoded = asciiDecoded;
  }
  if (supported.at(-1) === "FlateDecode") {
    return decodeBoundedZlib(decoded, decoded.byteLength);
  }
  return decoded.byteLength <= MAX_DECODED_STREAM_BYTES ? decoded : null;
}

function parseXrefStreamEntries(
  decoded: Uint8Array,
  dictionary: PdfDictionary,
  terminal: TerminalXref,
  xrefObject: { generation: number; objectId: number },
) {
  const size = integerValue(dictionary.entries.get("Size"));
  const widths = integerArray(dictionary.entries.get("W"));
  if (
    size === null
    || size <= 0
    || size > MAX_OBJECTS + 1
    || !widths
    || widths.length !== 3
    || widths.some((width) => width < 0 || width > 6)
  ) {
    return null;
  }
  const entryWidth = widths.reduce((total, width) => total + width, 0);
  if (entryWidth <= 0) return null;

  const index = dictionary.entries.has("Index")
    ? integerArray(dictionary.entries.get("Index"))
    : [0, size];
  if (!index || index.length === 0 || index.length % 2 !== 0) return null;

  const expectedEntries = index.reduce(
    (total, value, position) => position % 2 === 1 ? total + value : total,
    0,
  );
  if (
    expectedEntries <= 0
    || expectedEntries > MAX_OBJECTS + 1
    || expectedEntries * entryWidth !== decoded.byteLength
  ) {
    return null;
  }

  const entries = new Map<string, XrefEntry>();
  const declaredObjectIds = new Set<number>();
  let cursor = 0;
  for (let pair = 0; pair < index.length; pair += 2) {
    const firstObjectId = index[pair];
    const count = index[pair + 1];
    if (
      firstObjectId < 0
      || count <= 0
      || firstObjectId + count > size
    ) {
      return null;
    }

    for (let offset = 0; offset < count; offset += 1) {
      const fields = widths.map((width, field) => {
        if (width === 0) return field === 0 ? 1 : 0;
        const value = readBigEndianInteger(decoded, cursor, width);
        cursor += width;
        return value;
      });
      if (fields.some((field) => field === null)) return null;
      const [type, field2, field3] = fields as number[];
      const objectId = firstObjectId + offset;
      if (declaredObjectIds.has(objectId)) return null;
      declaredObjectIds.add(objectId);
      if (type === 0) continue;
      if (type !== 1) return null;
      if (
        objectId <= 0
        || field2 <= 0
        || field2 >= terminal.startxrefOffset
        || field3 < 0
        || field3 > 65_535
      ) {
        return null;
      }
      const key = referenceKey(objectId, field3);
      if (entries.has(key)) return null;
      entries.set(key, { generation: field3, objectId, offset: field2 });
    }
  }

  const xrefEntry = entries.get(referenceKey(xrefObject.objectId, xrefObject.generation));
  if (!xrefEntry || xrefEntry.offset !== terminal.xrefOffset) return null;
  return entries;
}

function integerArray(value: PdfValue | undefined) {
  if (value?.kind !== "array") return null;
  const integers: number[] = [];
  for (const item of value.values) {
    const integer = integerValue(item);
    if (integer === null) return null;
    integers.push(integer);
  }
  return integers;
}

function readBigEndianInteger(bytes: Uint8Array, offset: number, width: number) {
  if (offset < 0 || offset + width > bytes.length) return null;
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    value = value * 256 + bytes[offset + index];
    if (!Number.isSafeInteger(value)) return null;
  }
  return value;
}

function parseIndirectObject(
  bytes: Uint8Array,
  entry: XrefEntry,
  bodyEnd: number,
  entries: Map<string, XrefEntry>,
  parseObject: (entry: XrefEntry) => ParsedObject | null,
  parseBudget: ParseBudget,
): ParsedObject | null {
  const parser = new PdfParser(bytes, entry.offset, bodyEnd, parseBudget);
  const objectId = parser.readUnsignedInteger();
  const generation = parser.readUnsignedInteger();
  if (
    objectId !== entry.objectId
    || generation !== entry.generation
    || !parser.consumeKeyword("obj")
  ) {
    return null;
  }

  const value = parser.parseValue();
  if (!value) return null;
  parser.skipWhitespaceAndComments();

  let stream: Uint8Array | undefined;
  if (parser.peekKeyword("stream")) {
    if (value.kind !== "dictionary" || !parser.consumeKeyword("stream")) return null;
    while (parser.position < bodyEnd && isHorizontalWhitespace(bytes[parser.position])) {
      parser.position += 1;
    }
    if (!parser.consumeEndOfLine()) return null;

    const length = resolveLength(value.entries.get("Length"), entries, parseObject);
    if (length === null || length < 0 || parser.position + length > bodyEnd) return null;
    stream = bytes.slice(parser.position, parser.position + length);
    parser.position += length;
    parser.consumeEndOfLine();
    if (!parser.consumeKeyword("endstream")) return null;
  }

  parser.skipWhitespaceAndComments();
  if (!parser.consumeKeyword("endobj")) return null;

  return {
    end: parser.position,
    generation,
    objectId,
    start: entry.offset,
    stream,
    value,
  };
}

function resolveLength(
  value: PdfValue | undefined,
  entries: Map<string, XrefEntry>,
  parseObject: (entry: XrefEntry) => ParsedObject | null,
) {
  const direct = integerValue(value);
  if (direct !== null) return direct;
  const reference = referenceValue(value);
  if (!reference) return null;
  const entry = entries.get(referenceKey(reference.objectId, reference.generation));
  if (!entry) return null;
  const object = parseObject(entry);
  return object && !object.stream ? integerValue(object.value) : null;
}

function findContentStreamKeys(objects: Map<string, ParsedObject>) {
  const contentStreams = new Set<string>();
  const visitedReferences = new Set<string>();
  for (const object of objects.values()) {
    if (object.value.kind !== "dictionary") continue;
    const type = resolvedNameValue(object.value.entries.get("Type"), objects);
    const subtype = resolvedNameValue(object.value.entries.get("Subtype"), objects);
    if (
      object.stream
      && (
        subtype === "Form"
        || (
          type === "Pattern"
          && integerValue(object.value.entries.get("PatternType")) === 1
        )
      )
    ) {
      contentStreams.add(referenceKey(object.objectId, object.generation));
    }
    if (type === "Page") {
      addReferencedStreams(
        object.value.entries.get("Contents"),
        objects,
        contentStreams,
        visitedReferences,
      );
    }
    if (type === "Font" && subtype === "Type3") {
      addReferencedStreams(
        object.value.entries.get("CharProcs"),
        objects,
        contentStreams,
        visitedReferences,
      );
    }
    if (object.value.entries.has("AP")) {
      addReferencedStreams(
        object.value.entries.get("AP"),
        objects,
        contentStreams,
        visitedReferences,
      );
    }
  }
  return contentStreams;
}

function addReferencedStreams(
  value: PdfValue | undefined,
  objects: Map<string, ParsedObject>,
  contentStreams: Set<string>,
  seen: Set<string>,
) {
  if (!value) return;
  if (value.kind === "reference") {
    const key = referenceKey(value.objectId, value.generation);
    if (seen.has(key)) return;
    seen.add(key);
    const object = objects.get(key);
    if (!object) return;
    if (object.stream) {
      contentStreams.add(key);
      return;
    }
    addReferencedStreams(object.value, objects, contentStreams, seen);
    return;
  }
  if (value.kind === "array") {
    for (const item of value.values) {
      addReferencedStreams(item, objects, contentStreams, seen);
    }
    return;
  }
  if (value.kind === "dictionary") {
    for (const item of value.entries.values()) {
      addReferencedStreams(item, objects, contentStreams, seen);
    }
  }
}

function inspectValue(
  value: PdfValue,
  entries: Map<string, XrefEntry>,
  objects: Map<string, ParsedObject>,
  resourceBudget: ResourceBudget,
  stream?: Uint8Array,
  inspectAsContent = false,
): boolean {
  if (value.kind === "array") {
    return value.values.every(
      (item) => inspectValue(item, entries, objects, resourceBudget),
    );
  }
  if (value.kind === "reference") {
    return entries.has(referenceKey(value.objectId, value.generation));
  }
  if (value.kind !== "dictionary") return true;

  for (const key of value.entries.keys()) {
    if (ACTIVE_KEYS.has(key)) return false;
  }

  const action = resolvedNameValue(value.entries.get("S"), objects);
  const type = resolvedNameValue(value.entries.get("Type"), objects);
  const subtype = resolvedNameValue(value.entries.get("Subtype"), objects);
  if (
    isActionValue(value.entries.get("A"), objects)
    ||
    (action !== null && ACTIVE_ACTIONS.has(action))
    || (type !== null && ACTIVE_TYPES.has(type))
    || (subtype !== null && ACTIVE_TYPES.has(subtype))
  ) {
    return false;
  }

  if (subtype === "Image") {
    const width = integerValue(value.entries.get("Width"));
    const height = integerValue(value.entries.get("Height"));
    if (
      width === null
      || height === null
      || width <= 0
      || height <= 0
      || width > Math.floor(MAX_IMAGE_PIXELS / height)
    ) {
      return false;
    }
    const pixels = width * height;
    if (pixels > resourceBudget.remainingImagePixels) return false;
    resourceBudget.remainingImagePixels -= pixels;
  }

  if (
    stream
    && !inspectStream(stream, value, subtype, resourceBudget, inspectAsContent)
  ) {
    return false;
  }
  return [...value.entries.values()].every(
    (item) => inspectValue(item, entries, objects, resourceBudget),
  );
}

function inspectStream(
  stream: Uint8Array,
  dictionary: PdfDictionary,
  subtype: string | null,
  resourceBudget: ResourceBudget,
  inspectAsContent: boolean,
) {
  if (hasAnyKey(dictionary, ["F", "FDecodeParms", "FFilter", "Ref"])) {
    return false;
  }
  if (inspectAsContent && hasAnyKey(dictionary, ["DecodeParms", "DP"])) {
    return false;
  }
  const filters = readFilters(dictionary.entries.get("Filter"));
  if (!filters) return false;
  if (filters.length === 0) {
    return !inspectAsContent || isStaticContentStream(stream);
  }

  const normalized = filters.map(normalizeFilter);
  if (normalized.some((filter) => filter === null)) return false;
  const supported = normalized as string[];

  if (supported.length === 1 && supported[0] === "DCTDecode") {
    if (subtype !== "Image") return false;
    const dimensions = readContainedJpegDimensions(stream);
    return dimensions !== null
      && dimensions.width === integerValue(dictionary.entries.get("Width"))
      && dimensions.height === integerValue(dictionary.entries.get("Height"));
  }
  if (
    !(
      supported.length === 1
      && ["ASCIIHexDecode", "FlateDecode"].includes(supported[0])
    )
    && !(
      supported.length === 2
      && supported[0] === "ASCIIHexDecode"
      && supported[1] === "FlateDecode"
    )
  ) {
    return false;
  }

  let encoded = stream;
  if (supported[0] === "ASCIIHexDecode") {
    const decoded = decodeAsciiHex(encoded);
    if (!decoded) return false;
    encoded = decoded;
  }
  if (supported.at(-1) === "FlateDecode") {
    const decoded = decodeBoundedZlib(
      encoded,
      encoded.byteLength,
      resourceBudget.remainingDecodedBytes,
    );
    if (!decoded) return false;
    resourceBudget.remainingDecodedBytes -= decoded.byteLength;
    return !inspectAsContent || isStaticContentStream(decoded);
  }
  if (
    encoded.byteLength > MAX_DECODED_STREAM_BYTES
    || encoded.byteLength > resourceBudget.remainingDecodedBytes
  ) {
    return false;
  }
  resourceBudget.remainingDecodedBytes -= encoded.byteLength;
  return !inspectAsContent || isStaticContentStream(encoded);
}

function isStaticContentStream(bytes: Uint8Array) {
  let position = 0;
  let tokens = 0;
  while (position < bytes.length) {
    if (isPdfWhitespace(bytes[position])) {
      position += 1;
      continue;
    }
    if (bytes[position] === 0x25) {
      position += 1;
      while (position < bytes.length && !isEndOfLine(bytes[position])) position += 1;
      continue;
    }
    if (bytes[position] === 0x28) {
      const next = skipContentLiteralString(bytes, position);
      if (next === null) return false;
      position = next;
      continue;
    }
    if (bytes[position] === 0x3c && bytes[position + 1] !== 0x3c) {
      const next = skipContentHexString(bytes, position);
      if (next === null) return false;
      position = next;
      continue;
    }
    if (bytes[position] === 0x2f) {
      position += 1;
      while (
        position < bytes.length
        && !isPdfWhitespace(bytes[position])
        && !isDelimiter(bytes[position])
      ) {
        if (
          bytes[position] === 0x23
          && (
            hexadecimalValue(bytes[position + 1]) === null
            || hexadecimalValue(bytes[position + 2]) === null
          )
        ) {
          return false;
        }
        position += bytes[position] === 0x23 ? 3 : 1;
      }
      continue;
    }
    if (isDelimiter(bytes[position])) {
      position += 1;
      continue;
    }

    const start = position;
    while (
      position < bytes.length
      && !isPdfWhitespace(bytes[position])
      && !isDelimiter(bytes[position])
    ) {
      if (bytes[position] < 0x21 || bytes[position] > 0x7e) return false;
      position += 1;
    }
    tokens += 1;
    if (tokens > MAX_TOKENS || position === start) return false;
    if (
      position - start === 2
      && bytes[start] === 0x42
      && bytes[start + 1] === 0x49
    ) {
      return false;
    }
  }
  return true;
}

function skipContentLiteralString(bytes: Uint8Array, start: number) {
  let position = start + 1;
  let depth = 1;
  while (position < bytes.length) {
    const byte = bytes[position++];
    if (byte === 0x5c) {
      if (position >= bytes.length) return null;
      if (bytes[position] === 0x0d && bytes[position + 1] === 0x0a) {
        position += 2;
      } else {
        position += 1;
      }
    } else if (byte === 0x28) {
      depth += 1;
    } else if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) return position;
    }
  }
  return null;
}

function skipContentHexString(bytes: Uint8Array, start: number) {
  let position = start + 1;
  while (position < bytes.length) {
    const byte = bytes[position++];
    if (byte === 0x3e) return position;
    if (!isPdfWhitespace(byte) && hexadecimalValue(byte) === null) return null;
  }
  return null;
}

function decodeBoundedZlib(
  encoded: Uint8Array,
  originalLength: number,
  maxDecodedBytes = MAX_DECODED_STREAM_BYTES,
) {
  if (encoded.byteLength === 0) return null;
  const maxOutputLength = Math.min(
    MAX_DECODED_STREAM_BYTES,
    maxDecodedBytes,
    Math.max(
      SUSPICIOUS_EXPANSION_BYTES,
      originalLength * MAX_STREAM_EXPANSION_RATIO,
    ),
  );
  if (maxOutputLength <= 0) return null;
  try {
    const result = inflateSync(encoded, {
      info: true,
      maxOutputLength,
    }) as unknown as {
      buffer: Uint8Array;
      engine: { bytesWritten: number };
    };
    if (result.engine.bytesWritten !== encoded.byteLength) return null;
    return new Uint8Array(result.buffer);
  } catch {
    return null;
  }
}

function decodeAsciiHex(bytes: Uint8Array) {
  let nibbleCount = 0;
  let ended = false;
  for (const byte of bytes) {
    if (isPdfWhitespace(byte)) continue;
    if (byte === 0x3e) {
      ended = true;
      continue;
    }
    if (ended) return null;
    const nibble = hexadecimalValue(byte);
    if (nibble === null) return null;
    nibbleCount += 1;
    if (nibbleCount > MAX_DECODED_STREAM_BYTES * 2) return null;
  }
  if (!ended) return null;

  const decoded = new Uint8Array(Math.ceil(nibbleCount / 2));
  let highNibble: number | null = null;
  let output = 0;
  for (const byte of bytes) {
    if (isPdfWhitespace(byte)) continue;
    if (byte === 0x3e) break;
    const nibble = hexadecimalValue(byte);
    if (nibble === null) return null;
    if (highNibble === null) {
      highNibble = nibble;
    } else {
      decoded[output] = (highNibble << 4) | nibble;
      output += 1;
      highNibble = null;
    }
  }
  if (highNibble !== null) decoded[output] = highNibble << 4;
  return decoded;
}

function readFilters(value: PdfValue | undefined) {
  if (!value) return [];
  if (value.kind === "name") return [value.value];
  if (value.kind !== "array") return null;
  const filters: string[] = [];
  for (const item of value.values) {
    if (item.kind !== "name") return null;
    filters.push(item.value);
  }
  return filters;
}

function normalizeFilter(value: string) {
  const aliases: Record<string, string> = {
    AHx: "ASCIIHexDecode",
    ASCIIHexDecode: "ASCIIHexDecode",
    DCT: "DCTDecode",
    DCTDecode: "DCTDecode",
    Fl: "FlateDecode",
    FlateDecode: "FlateDecode",
  };
  return aliases[value] ?? null;
}

function objectsCoverBody(
  bytes: Uint8Array,
  headerEnd: number,
  bodyEnd: number,
  objects: ParsedObject[],
) {
  const sorted = objects.toSorted((left, right) => left.start - right.start);
  let cursor = headerEnd;
  for (const object of sorted) {
    if (object.start < cursor || !isWhitespaceOrComments(bytes, cursor, object.start)) {
      return false;
    }
    cursor = object.end;
  }
  return isWhitespaceOrComments(bytes, cursor, bodyEnd);
}

function isWhitespaceOrComments(bytes: Uint8Array, start: number, end: number) {
  let position = start;
  while (position < end) {
    if (isPdfWhitespace(bytes[position])) {
      position += 1;
      continue;
    }
    if (bytes[position] !== 0x25) return false;
    position += 1;
    while (position < end && !isEndOfLine(bytes[position])) position += 1;
  }
  return true;
}

function readHeaderEnd(bytes: Uint8Array) {
  if (bytes.length < 14 || ascii(bytes, 0, 8).match(/^%PDF-[12]\.[0-9]$/) === null) {
    return null;
  }
  const position = 8;
  if (bytes[position] === 0x0d && bytes[position + 1] === 0x0a) return position + 2;
  if (isEndOfLine(bytes[position])) return position + 1;
  return null;
}

function readTerminalXref(bytes: Uint8Array) {
  const source = new TextDecoder("latin1").decode(bytes);
  const match = /startxref[\t \r\n]+(\d+)[\t \r\n]+%%EOF[\0\t\n\f\r ]*$/.exec(source);
  if (!match) return null;
  const xrefOffset = Number(match[1]);
  return Number.isSafeInteger(xrefOffset) && xrefOffset > 0 && xrefOffset < match.index
    ? { end: bytes.length, startxrefOffset: match.index, xrefOffset }
    : null;
}

class PdfParser {
  position: number;

  constructor(
    private readonly bytes: Uint8Array,
    position: number,
    private readonly limit: number,
    private readonly budget: ParseBudget,
  ) {
    this.position = position;
  }

  parseValue(depth = 0): PdfValue | null {
    this.skipWhitespaceAndComments();
    if (
      depth > MAX_PARSE_DEPTH
      || this.budget.remainingTokens <= 0
      || this.position >= this.limit
    ) {
      return null;
    }
    this.budget.remainingTokens -= 1;

    const byte = this.bytes[this.position];
    if (byte === 0x2f) return this.readName();
    if (byte === 0x28) return this.readLiteralString();
    if (byte === 0x5b) return this.readArray(depth + 1);
    if (byte === 0x3c && this.bytes[this.position + 1] === 0x3c) {
      return this.readDictionary(depth + 1);
    }
    if (byte === 0x3c) return this.readHexString();
    if (isNumberStart(byte)) return this.readNumberOrReference();
    if (this.consumeKeyword("true")) return { kind: "boolean", value: true };
    if (this.consumeKeyword("false")) return { kind: "boolean", value: false };
    if (this.consumeKeyword("null")) return { kind: "null" };
    return null;
  }

  readUnsignedInteger() {
    this.skipWhitespaceAndComments();
    const start = this.position;
    while (this.position < this.limit && isDigit(this.bytes[this.position])) {
      this.position += 1;
    }
    if (this.position === start) return null;
    const value = Number(ascii(this.bytes, start, this.position - start));
    return Number.isSafeInteger(value) ? value : null;
  }

  readBareWord() {
    this.skipWhitespaceAndComments();
    const start = this.position;
    while (
      this.position < this.limit
      && !isPdfWhitespace(this.bytes[this.position])
      && !isDelimiter(this.bytes[this.position])
    ) {
      this.position += 1;
    }
    return this.position > start
      ? ascii(this.bytes, start, this.position - start)
      : null;
  }

  consumeKeyword(keyword: string) {
    this.skipWhitespaceAndComments();
    if (ascii(this.bytes, this.position, keyword.length) !== keyword) return false;
    const next = this.bytes[this.position + keyword.length];
    if (next !== undefined && !isPdfWhitespace(next) && !isDelimiter(next)) return false;
    this.position += keyword.length;
    return true;
  }

  peekKeyword(keyword: string) {
    const saved = this.position;
    const matches = this.consumeKeyword(keyword);
    this.position = saved;
    return matches;
  }

  consumeRaw(value: string) {
    if (ascii(this.bytes, this.position, value.length) !== value) return false;
    this.position += value.length;
    return true;
  }

  consumeEndOfLine() {
    if (this.bytes[this.position] === 0x0d && this.bytes[this.position + 1] === 0x0a) {
      this.position += 2;
      return true;
    }
    if (isEndOfLine(this.bytes[this.position])) {
      this.position += 1;
      return true;
    }
    return false;
  }

  skipWhitespaceAndComments() {
    while (this.position < this.limit) {
      if (isPdfWhitespace(this.bytes[this.position])) {
        this.position += 1;
        continue;
      }
      if (this.bytes[this.position] !== 0x25) return;
      this.position += 1;
      while (this.position < this.limit && !isEndOfLine(this.bytes[this.position])) {
        this.position += 1;
      }
    }
  }

  skipWhitespaceOnly() {
    while (this.position < this.limit && isPdfWhitespace(this.bytes[this.position])) {
      this.position += 1;
    }
  }

  private readName(): PdfValue | null {
    this.position += 1;
    let value = "";
    while (
      this.position < this.limit
      && !isPdfWhitespace(this.bytes[this.position])
      && !isDelimiter(this.bytes[this.position])
    ) {
      const byte = this.bytes[this.position];
      if (byte === 0x23) {
        const high = hexadecimalValue(this.bytes[this.position + 1]);
        const low = hexadecimalValue(this.bytes[this.position + 2]);
        if (high === null || low === null) return null;
        value += String.fromCharCode((high << 4) | low);
        this.position += 3;
      } else {
        value += String.fromCharCode(byte);
        this.position += 1;
      }
    }
    return value.length > 0 ? { kind: "name", value } : null;
  }

  private readLiteralString(): PdfValue | null {
    this.position += 1;
    let depth = 1;
    while (this.position < this.limit) {
      const byte = this.bytes[this.position++];
      if (byte === 0x5c) {
        if (this.position >= this.limit) return null;
        if (this.bytes[this.position] === 0x0d && this.bytes[this.position + 1] === 0x0a) {
          this.position += 2;
        } else {
          this.position += 1;
        }
      } else if (byte === 0x28) {
        depth += 1;
      } else if (byte === 0x29) {
        depth -= 1;
        if (depth === 0) return { kind: "string" };
      }
    }
    return null;
  }

  private readHexString(): PdfValue | null {
    this.position += 1;
    while (this.position < this.limit) {
      const byte = this.bytes[this.position++];
      if (byte === 0x3e) return { kind: "string" };
      if (!isPdfWhitespace(byte) && hexadecimalValue(byte) === null) return null;
    }
    return null;
  }

  private readArray(depth: number): PdfValue | null {
    this.position += 1;
    const values: PdfValue[] = [];
    while (values.length <= MAX_TOKENS) {
      this.skipWhitespaceAndComments();
      if (this.bytes[this.position] === 0x5d) {
        this.position += 1;
        return { kind: "array", values };
      }
      const value = this.parseValue(depth);
      if (!value) return null;
      values.push(value);
    }
    return null;
  }

  private readDictionary(depth: number): PdfValue | null {
    this.position += 2;
    const entries = new Map<string, PdfValue>();
    while (entries.size <= MAX_TOKENS) {
      this.skipWhitespaceAndComments();
      if (this.bytes[this.position] === 0x3e && this.bytes[this.position + 1] === 0x3e) {
        this.position += 2;
        return { entries, kind: "dictionary" };
      }
      const key = this.readName();
      if (!key || key.kind !== "name" || entries.has(key.value)) return null;
      const value = this.parseValue(depth);
      if (!value) return null;
      entries.set(key.value, value);
    }
    return null;
  }

  private readNumberOrReference(): PdfValue | null {
    const first = this.readNumber();
    if (!first) return null;
    const afterFirst = this.position;
    if (first.integer && first.value >= 0) {
      const second = this.readNumber();
      if (
        second?.integer
        && second.value >= 0
        && Number.isSafeInteger(second.value)
        && this.consumeKeyword("R")
      ) {
        return {
          generation: second.value,
          kind: "reference",
          objectId: first.value,
        };
      }
    }
    this.position = afterFirst;
    return first;
  }

  private readNumber(): PdfNumber | null {
    this.skipWhitespaceAndComments();
    const start = this.position;
    if ([0x2b, 0x2d].includes(this.bytes[this.position])) this.position += 1;
    let digits = 0;
    let decimalPoints = 0;
    while (this.position < this.limit) {
      const byte = this.bytes[this.position];
      if (isDigit(byte)) {
        digits += 1;
        this.position += 1;
      } else if (byte === 0x2e && decimalPoints === 0) {
        decimalPoints += 1;
        this.position += 1;
      } else {
        break;
      }
    }
    if (digits === 0) return null;
    const value = Number(ascii(this.bytes, start, this.position - start));
    return Number.isFinite(value)
      ? { integer: decimalPoints === 0 && Number.isSafeInteger(value), kind: "number", value }
      : null;
  }
}

function hasAnyKey(dictionary: PdfDictionary, keys: readonly string[]) {
  return keys.some((key) => dictionary.entries.has(key));
}

function referencesResolve(value: PdfValue, entries: Map<string, XrefEntry>): boolean {
  if (value.kind === "reference") {
    return entries.has(referenceKey(value.objectId, value.generation));
  }
  if (value.kind === "array") {
    return value.values.every((item) => referencesResolve(item, entries));
  }
  if (value.kind === "dictionary") {
    return [...value.entries.values()].every((item) => referencesResolve(item, entries));
  }
  return true;
}

function integerValue(value: PdfValue | undefined) {
  return value?.kind === "number" && value.integer && Number.isSafeInteger(value.value)
    ? value.value
    : null;
}

function nameValue(value: PdfValue | undefined) {
  return value?.kind === "name" ? value.value : null;
}

function resolvedNameValue(
  initial: PdfValue | undefined,
  objects: Map<string, ParsedObject>,
) {
  let value = initial;
  const seen = new Set<string>();
  for (let depth = 0; depth <= MAX_PARSE_DEPTH; depth += 1) {
    if (!value) return null;
    if (value.kind === "name") return value.value;
    if (value.kind !== "reference") return null;
    const key = referenceKey(value.objectId, value.generation);
    if (seen.has(key)) return null;
    seen.add(key);
    value = objects.get(key)?.value;
  }
  return null;
}

function isActionValue(
  initial: PdfValue | undefined,
  objects: Map<string, ParsedObject>,
) {
  let value = initial;
  const seen = new Set<string>();
  for (let depth = 0; depth <= MAX_PARSE_DEPTH; depth += 1) {
    if (!value) return false;
    if (value.kind === "dictionary") {
      return value.entries.has("S")
        || resolvedNameValue(value.entries.get("Type"), objects) === "Action";
    }
    if (value.kind !== "reference") return false;
    const key = referenceKey(value.objectId, value.generation);
    if (seen.has(key)) return false;
    seen.add(key);
    value = objects.get(key)?.value;
  }
  return false;
}

function referenceValue(value: PdfValue | undefined) {
  return value?.kind === "reference" ? value : null;
}

function referenceKey(objectId: number, generation: number) {
  return `${objectId}:${generation}`;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) return "";
  let value = "";
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function hexadecimalValue(byte: number | undefined) {
  if (byte === undefined) return null;
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return null;
}

function isDelimiter(byte: number | undefined) {
  return byte !== undefined && [
    0x25,
    0x28,
    0x29,
    0x2f,
    0x3c,
    0x3e,
    0x5b,
    0x5d,
    0x7b,
    0x7d,
  ].includes(byte);
}

function isDigit(byte: number | undefined) {
  return byte !== undefined && byte >= 0x30 && byte <= 0x39;
}

function isEndOfLine(byte: number | undefined) {
  return byte === 0x0a || byte === 0x0d;
}

function isHorizontalWhitespace(byte: number | undefined) {
  return byte === 0x00 || byte === 0x09 || byte === 0x0c || byte === 0x20;
}

function isNumberStart(byte: number | undefined) {
  return isDigit(byte) || byte === 0x2b || byte === 0x2d || byte === 0x2e;
}

function isPdfWhitespace(byte: number | undefined) {
  return byte === 0x00
    || byte === 0x09
    || byte === 0x0a
    || byte === 0x0c
    || byte === 0x0d
    || byte === 0x20;
}
