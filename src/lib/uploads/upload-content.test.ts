import { deflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { validateUploadedFileContent } from "@/lib/uploads/upload-content";
import {
  validJpegBytes,
  validPdfBytes,
  validPngBytes,
  validWebpBytes,
} from "@/test-utils/upload-content";

describe("validateUploadedFileContent", () => {
  it.each([
    ["application/pdf", "evidence.pdf", validPdfBytes()],
    ["application/pdf", "xref-stream.pdf", xrefStreamPdfBytes()],
    ["application/pdf", "flate-xref-stream.pdf", flateXrefStreamPdfBytes()],
    ["application/pdf", "embedded-jpeg.pdf", dctImagePdfBytes(validJpegBytes(), 1, 1)],
    ["image/jpeg", "photo.jpeg", validJpegBytes()],
    ["image/png", "photo.png", validPngBytes()],
    ["image/webp", "photo.webp", validWebpBytes()],
  ] as const)("accepts structurally valid %s content", async (type, name, bytes) => {
    const result = await validateUploadedFileContent(
      new File([bytes], name, { type }),
      [type],
    );

    expect(result).toMatchObject({
      contentType: type,
      ok: true,
    });
    if (result.ok) {
      expect(result.bytes).toEqual(bytes);
    }
  });

  it("rejects plain text labelled as a PDF", async () => {
    const result = await validateUploadedFileContent(
      new File(["not a PDF"], "evidence.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it("rejects content whose detected type disagrees with the declared MIME", async () => {
    const result = await validateUploadedFileContent(
      new File([validPngBytes()], "photo.jpg", { type: "image/jpeg" }),
      ["image/jpeg", "image/png"],
    );

    expect(result).toEqual({ ok: false, reason: "type_mismatch" });
  });

  it("rejects a filename suffix that disagrees with the verified content", async () => {
    const result = await validateUploadedFileContent(
      new File([validPdfBytes()], "evidence.png", { type: "application/pdf" }),
      ["application/pdf", "image/png"],
    );

    expect(result).toEqual({ ok: false, reason: "extension_mismatch" });
  });

  it.each([
    ["PDF without EOF", "application/pdf", "bad.pdf", validPdfBytes().slice(0, -6)],
    ["PDF marker-only payload", "application/pdf", "marker-only.pdf", markerOnlyPdfBytes()],
    ["PNG without IDAT", "image/png", "bad.png", pngBytes(false)],
    ["JPEG without scan", "image/jpeg", "bad.jpg", jpegBytes(false)],
    ["WebP with a forged RIFF length", "image/webp", "bad.webp", webpBytes(false)],
    [
      "extended WebP without image data",
      "image/webp",
      "bad-extended.webp",
      webpExtendedHeaderOnly(),
    ],
  ] as const)("rejects structurally incomplete content: %s", async (_label, type, name, bytes) => {
    const result = await validateUploadedFileContent(
      new File([bytes], name, { type }),
      [type],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it.each([
    ["PNG with corrupt compressed image data", "image/png", "corrupt.png", corruptPngBytes()],
    ["JPEG with invalid entropy data", "image/jpeg", "corrupt.jpg", jpegBytes()],
  ] as const)("rejects structurally plausible but undecodable content: %s", async (
    _label,
    type,
    name,
    bytes,
  ) => {
    const result = await validateUploadedFileContent(
      new File([bytes], name, { type }),
      [type],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it("rejects an oversized file before reading or decoding its bytes", async () => {
    const file = new File([validPdfBytes()], "oversized.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: (10 * 1024 * 1024) + 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    const result = await validateUploadedFileContent(file, ["application/pdf"]);

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a document-open JavaScript action",
      classicPdfBytes(
        "/OpenAction 3 0 R",
        ["<< /S /JavaScript /JS (app.alert\\(\\\"opened\\\"\\)) >>"],
      ),
    ],
    [
      "a document additional JavaScript action",
      classicPdfBytes(
        "/AA << /WC 3 0 R >>",
        ["<< /S /JavaScript /JS (app.alert\\(\\\"closing\\\"\\)) >>"],
      ),
    ],
    [
      "a document-open Launch action",
      classicPdfBytes(
        "/OpenAction 3 0 R",
        ["<< /S /Launch /F (cmd.exe) /Win << /F (cmd.exe) /P (/c calc.exe) >> >>"],
      ),
    ],
    [
      "a Launch action whose action name is an indirect object",
      indirectLaunchActionPdfBytes(),
    ],
    [
      "a PDF 2.0 GoToDp action",
      pageActionPdfBytes("GoToDp", "/D (destination.pdf)"),
    ],
    [
      "a PDF 2.0 RichMediaExecute action",
      pageActionPdfBytes("RichMediaExecute", "/TA 4 0 R /CMD << /C /Play >>"),
    ],
    [
      "a custom plug-in action reached through an annotation action key",
      pageActionPdfBytes("VendorAction", "/Payload (run)"),
    ],
    [
      "an EmbeddedFiles name-tree attachment",
      classicPdfBytes(
        "/Names << /EmbeddedFiles << /Names [(payload.exe) 3 0 R] >> >>",
        [
          "<< /Type /Filespec /F (payload.exe) /EF << /F 4 0 R >> >>",
          streamObject("/Type /EmbeddedFile", "MZ\\0\\0"),
        ],
      ),
    ],
    [
      "an Associated File attachment",
      classicPdfBytes(
        "/AF [3 0 R]",
        [
          "<< /Type /Filespec /F (payload.exe) /AFRelationship /Data /EF << /F 4 0 R >> >>",
          streamObject("/Type /EmbeddedFile", "MZ\\0\\0"),
        ],
      ),
    ],
    [
      "a RichMedia annotation and embedded asset",
      richMediaPdfBytes(),
    ],
    [
      "an AcroForm XFA packet",
      classicPdfBytes(
        "/AcroForm 3 0 R",
        [
          "<< /Fields [] /XFA 4 0 R >>",
          streamObject("/Subtype /XML", '<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"/>'),
        ],
      ),
    ],
    [
      "an incremental update that adds a document-open JavaScript action",
      incrementalJavaScriptPdfBytes(),
    ],
    [
      "a JavaScript action in a cross-reference-stream PDF",
      xrefStreamJavaScriptPdfBytes(),
    ],
    [
      "a JavaScript action packed into an object stream",
      objectStreamJavaScriptPdfBytes(),
    ],
    [
      "an encrypted PDF trailer",
      pdfBytesWithTrailerEntries([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [] /Count 0 >>",
        "<< /Filter /Standard /V 2 /R 3 /Length 128 >>",
      ], "/Encrypt 3 0 R"),
    ],
    [
      "a hybrid classic and stream xref",
      pdfBytesWithTrailerEntries([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [] /Count 0 >>",
      ], "/XRefStm 9"),
    ],
    [
      "an xref stream with an unsupported filter",
      filteredXrefStreamPdfBytes("/Filter /ASCII85Decode"),
    ],
    [
      "an xref stream with unimplemented predictor parameters",
      flateXrefStreamPdfBytes("/DecodeParms << /Predictor 2 /Columns 7 >>"),
    ],
    [
      "an xref stream using the abbreviated predictor-parameter key",
      flateXrefStreamPdfBytes("/DP << /Predictor 2 /Columns 7 >>"),
    ],
    [
      "a Flate xref stream with bytes after the zlib member",
      filteredXrefStreamPdfBytes(
        "/Filter /FlateDecode",
        (entries) => concatenate(
          new Uint8Array(deflateSync(entries)),
          new TextEncoder().encode("ABC"),
        ),
      ),
    ],
    [
      "a Flate xref stream with a corrupt Adler checksum",
      filteredXrefStreamPdfBytes(
        "/Filter /FlateDecode",
        (entries) => {
          const encoded = new Uint8Array(deflateSync(entries));
          encoded[encoded.length - 1] ^= 0xff;
          return encoded;
        },
      ),
    ],
    [
      "overlapping xref-stream Index ranges",
      overlappingIndexXrefStreamPdfBytes(),
    ],
    [
      "a malformed DCT image stream",
      dctImagePdfBytes(new TextEncoder().encode("notjpeg"), 1, 1),
    ],
    [
      "a DCT image whose JPEG dimensions disagree with its PDF dictionary",
      dctImagePdfBytes(validJpegBytes(), 2, 1),
    ],
    [
      "a DCT image with zero frame and scan components",
      dctImagePdfBytes(zeroComponentJpegBytes(), 1, 1),
    ],
    [
      "many individually bounded DCT images whose aggregate pixels exceed the document budget",
      cumulativeDctImagePdfBytes(),
    ],
    [
      "a content stream loaded from an external URL file specification",
      externalContentStreamPdfBytes(),
    ],
    [
      "a reference XObject that imports an external PDF",
      referenceXObjectPdfBytes(),
    ],
    [
      "a pass-through PostScript XObject",
      postScriptXObjectPdfBytes(),
    ],
    [
      "an inline-image Flate bomb hidden inside a page content stream",
      inlineImageExpansionPdfBytes(),
    ],
    [
      "a predictor-encoded content stream that reveals an inline-image operator",
      predictorContentStreamPdfBytes(),
    ],
    [
      "a reachable Flate stream with expansion beyond the upload parser budget",
      compressedExpansionPdfBytes(),
    ],
    [
      "many individually bounded Flate streams whose cumulative output exceeds the document budget",
      cumulativeCompressedExpansionPdfBytes(),
    ],
    [
      "many individually bounded objects whose cumulative token count exceeds the document budget",
      cumulativeTokenPdfBytes(),
    ],
    [
      "a reachable stream whose declared length exceeds its actual bytes",
      malformedStreamLengthPdfBytes(),
    ],
    [
      "a classic xref free entry whose object id is outside trailer Size",
      outOfRangeFreeXrefEntryPdfBytes(),
    ],
  ] as const)("rejects dangerous or malformed PDF content: %s", async (_label, bytes) => {
    const result = await validateUploadedFileContent(
      new File([bytes], "evidence.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it("rejects a PDF-ZIP polyglot with bytes after its terminal EOF", async () => {
    const result = await validateUploadedFileContent(
      new File([
        concatenate(validPdfBytes(), new TextEncoder().encode("PK\\x03\\x04not-a-zip-central-directory")),
      ], "evidence.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it("does not treat dangerous-looking text inside strings, comments, or streams as PDF objects", async () => {
    const content = "% /JavaScript /Launch /EmbeddedFiles\nBT (/OpenAction /RichMedia /XFA) Tj ET";
    const bytes = pdfBytes([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Contents 4 0 R >>",
      streamObject("", content),
      "<< /Producer (Text mentioning /JavaScript, /Launch, /EmbeddedFiles, /RichMedia, and /XFA) >>",
    ]);

    const result = await validateUploadedFileContent(
      new File([bytes], "static.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toMatchObject({ contentType: "application/pdf", ok: true });
  });

  it("rejects escaped PDF names that decode to an active action", async () => {
    const bytes = classicPdfBytes(
      "/Open#41ction 3 0 R",
      ["<< /S /Java#53cript /J#53 (app.alert\\(\\\"escaped\\\"\\)) >>"],
    );

    const result = await validateUploadedFileContent(
      new File([bytes], "escaped-action.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it("rejects overlapping xref subsections that declare the same object id twice", async () => {
    const result = await validateUploadedFileContent(
      new File([overlappingXrefPdfBytes()], "overlapping-xref.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });

  it("rejects a dangling reference in the classic trailer", async () => {
    const bytes = pdfBytesWithTrailerEntries([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [] /Count 0 >>",
    ], "/Info 9 0 R");
    const result = await validateUploadedFileContent(
      new File([bytes], "dangling-trailer.pdf", { type: "application/pdf" }),
      ["application/pdf"],
    );

    expect(result).toEqual({ ok: false, reason: "invalid_content" });
  });
});

function markerOnlyPdfBytes() {
  return new TextEncoder().encode("%PDF-1.7\nnot a PDF document\n%%EOF\n");
}

function xrefStreamPdfBytes() {
  const header = "%PDF-1.7\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let offset = byteLength(header);
  for (const object of objects) {
    offsets.push(offset);
    offset += byteLength(object);
  }
  const xrefOffset = offset;
  const entries = new Uint8Array(4 * 7);
  writeXrefEntry(entries, 0, 0, 0, 65535);
  writeXrefEntry(entries, 7, 1, offsets[0], 0);
  writeXrefEntry(entries, 14, 1, offsets[1], 0);
  writeXrefEntry(entries, 21, 1, xrefOffset, 0);
  const prefix = `3 0 obj\n<< /Type /XRef /Size 4 /Root 1 0 R /W [1 4 2] /Index [0 4] /Length ${entries.length} >>\nstream\n`;
  const suffix = `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(
    new TextEncoder().encode(header),
    ...objects.map((object) => new TextEncoder().encode(object)),
    new TextEncoder().encode(prefix),
    entries,
    new TextEncoder().encode(suffix),
  );
}

function flateXrefStreamPdfBytes(decodeParameters = "") {
  return filteredXrefStreamPdfBytes(
    `/Filter /FlateDecode ${decodeParameters}`,
    (entries) => new Uint8Array(deflateSync(entries)),
  );
}

function filteredXrefStreamPdfBytes(
  filterEntries: string,
  encode: (entries: Uint8Array) => Uint8Array = (entries) => entries,
) {
  const header = "%PDF-1.7\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let offset = byteLength(header);
  for (const object of objects) {
    offsets.push(offset);
    offset += byteLength(object);
  }
  const xrefOffset = offset;
  const entries = new Uint8Array(4 * 7);
  writeXrefEntry(entries, 0, 0, 0, 65535);
  writeXrefEntry(entries, 7, 1, offsets[0], 0);
  writeXrefEntry(entries, 14, 1, offsets[1], 0);
  writeXrefEntry(entries, 21, 1, xrefOffset, 0);
  const encoded = encode(entries);
  const prefix = `3 0 obj\n<< /Type /XRef /Size 4 /Root 1 0 R /W [1 4 2] /Index [0 4] ${filterEntries} /Length ${encoded.length} >>\nstream\n`;
  const suffix = `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(
    new TextEncoder().encode(header),
    ...objects.map((object) => new TextEncoder().encode(object)),
    new TextEncoder().encode(prefix),
    encoded,
    new TextEncoder().encode(suffix),
  );
}

function overlappingIndexXrefStreamPdfBytes() {
  const header = "%PDF-1.7\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let offset = byteLength(header);
  for (const object of objects) {
    offsets.push(offset);
    offset += byteLength(object);
  }
  const xrefOffset = offset;
  const entries = new Uint8Array(5 * 7);
  writeXrefEntry(entries, 0, 0, 0, 65535);
  writeXrefEntry(entries, 7, 1, offsets[0], 0);
  writeXrefEntry(entries, 14, 1, offsets[1], 0);
  writeXrefEntry(entries, 21, 1, xrefOffset, 0);
  writeXrefEntry(entries, 28, 1, offsets[0], 1);
  const prefix = `3 0 obj\n<< /Type /XRef /Size 4 /Root 1 0 R /W [1 4 2] /Index [0 4 1 1] /Length ${entries.length} >>\nstream\n`;
  const suffix = `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(
    new TextEncoder().encode(header),
    ...objects.map((object) => new TextEncoder().encode(object)),
    new TextEncoder().encode(prefix),
    entries,
    new TextEncoder().encode(suffix),
  );
}

function dctImagePdfBytes(jpeg: Uint8Array, width: number, height: number) {
  const prefix = new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << /XObject << /Im0 4 0 R >> >> >>\nendobj\n4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`,
  );
  const suffix = new TextEncoder().encode("\nendstream\nendobj\n");
  const body = concatenate(prefix, jpeg, suffix);
  const offsets = [
    byteLength("%PDF-1.7\n"),
    findSequence(body, new TextEncoder().encode("2 0 obj")),
    findSequence(body, new TextEncoder().encode("3 0 obj")),
    findSequence(body, new TextEncoder().encode("4 0 obj")),
  ];
  const xrefOffset = body.byteLength;
  const xref = `xref\n0 5\n0000000000 65535 f \n${offsets.map((value) => `${xrefEntry(value)}\n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(body, new TextEncoder().encode(xref));
}

function cumulativeDctImagePdfBytes() {
  const dimension = 6_324;
  const jpeg = validJpegBytes().slice();
  const sof = findSequence(jpeg, new Uint8Array([0xff, 0xc0]));
  jpeg[sof + 5] = dimension >> 8;
  jpeg[sof + 6] = dimension & 0xff;
  jpeg[sof + 7] = dimension >> 8;
  jpeg[sof + 8] = dimension & 0xff;
  const imageCount = 6;
  const imageNames = Array.from(
    { length: imageCount },
    (_, index) => `/Im${index} ${index + 4} 0 R`,
  ).join(" ");
  const contentObjectId = imageCount + 4;
  const content = Array.from(
    { length: imageCount },
    (_, index) => `q 1 0 0 1 0 0 cm /Im${index} Do Q`,
  ).join("\n");
  const objectBodies: Uint8Array[] = [
    new TextEncoder().encode("<< /Type /Catalog /Pages 2 0 R >>"),
    new TextEncoder().encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    new TextEncoder().encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << /XObject << ${imageNames} >> >> /Contents ${contentObjectId} 0 R >>`,
    ),
    ...Array.from({ length: imageCount }, () => concatenate(
      new TextEncoder().encode(
        `<< /Type /XObject /Subtype /Image /Width ${dimension} /Height ${dimension} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`,
      ),
      jpeg,
      new TextEncoder().encode("\nendstream"),
    )),
    new TextEncoder().encode(streamObject("", content)),
  ];
  return binaryPdfBytes(objectBodies);
}

function binaryPdfBytes(objectBodies: readonly Uint8Array[]) {
  const parts: Uint8Array[] = [new TextEncoder().encode("%PDF-1.7\n")];
  const offsets: number[] = [];
  let length = parts[0].byteLength;
  objectBodies.forEach((body, index) => {
    const prefix = new TextEncoder().encode(`${index + 1} 0 obj\n`);
    const suffix = new TextEncoder().encode("\nendobj\n");
    offsets.push(length);
    parts.push(prefix, body, suffix);
    length += prefix.byteLength + body.byteLength + suffix.byteLength;
  });
  const xref = `xref\n0 ${objectBodies.length + 1}\n0000000000 65535 f \n${offsets.map((value) => `${xrefEntry(value)}\n`).join("")}trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(new TextEncoder().encode(xref));
  return concatenate(...parts);
}

function classicPdfBytes(catalogEntries: string, extraObjects: readonly string[]) {
  return pdfBytes([
    `<< /Type /Catalog /Pages 2 0 R ${catalogEntries} >>`,
    "<< /Type /Pages /Kids [] /Count 0 >>",
    ...extraObjects,
  ]);
}

function richMediaPdfBytes() {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Annots [4 0 R] >>",
    "<< /Type /Annot /Subtype /RichMedia /Rect [0 0 1 1] /RichMediaContent << /Assets << /Names [(payload.swf) 5 0 R] >> /Configurations [<< /Type /RichMediaConfiguration /Subtype /Video /Instances [] >>] >> >>",
    "<< /Type /Filespec /F (payload.swf) /EF << /F 6 0 R >> >>",
    streamObject("/Type /EmbeddedFile /Subtype /application#2Fvnd.adobe.flash.movie", "FWS"),
  ]);
}

function indirectLaunchActionPdfBytes() {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Annots [4 0 R] >>",
    "<< /Type /Annot /Subtype /Link /Rect [0 0 1 1] /A 5 0 R >>",
    "<< /Type /Action /S 6 0 R /F (cmd.exe) >>",
    "/Launch",
  ]);
}

function pageActionPdfBytes(action: string, entries: string) {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Annots [4 0 R] >>",
    `<< /Type /Annot /Subtype /Link /Rect [0 0 1 1] /A << /S /${action} ${entries} >> >>`,
  ]);
}

function externalContentStreamPdfBytes() {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 /F << /FS /URL /F (https://attacker.invalid/content) >> >>\nstream\n\nendstream",
  ]);
}

function referenceXObjectPdfBytes() {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << /XObject << /Ref0 4 0 R >> >> >>",
    "<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Ref << /F << /F (remote.pdf) >> /Page 0 >> /Length 0 >>\nstream\n\nendstream",
  ]);
}

function postScriptXObjectPdfBytes() {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << /XObject << /PS0 4 0 R >> >> >>",
    streamObject("/Type /XObject /Subtype /PS", "%!PS /Helvetica findfont"),
  ]);
}

function inlineImageExpansionPdfBytes() {
  const width = 40_000_001;
  const compressed = new Uint8Array(deflateSync(new Uint8Array(width)));
  const content = concatenate(
    new TextEncoder().encode(`BI /W ${width} /H 1 /CS /G /BPC 8 /F /Fl ID\n`),
    compressed,
    new TextEncoder().encode("\nEI\n"),
  );
  return pageContentStreamPdfBytes(content);
}

function predictorContentStreamPdfBytes() {
  const decoded = new Uint8Array([40, 1, 25, 7, 215, 41]);
  return pageContentStreamPdfBytes(
    new Uint8Array(deflateSync(decoded)),
    "/Filter /FlateDecode /DecodeParms << /Predictor 2 /Columns 6 >>",
  );
}

function pageContentStreamPdfBytes(content: Uint8Array, dictionaryEntries = "") {
  const header = "%PDF-1.7\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Contents 4 0 R >>\nendobj\n",
  ];
  const prefix = `${header}${objects.join("")}4 0 obj\n<< ${dictionaryEntries} /Length ${content.byteLength} >>\nstream\n`;
  const body = concatenate(
    new TextEncoder().encode(prefix),
    content,
    new TextEncoder().encode("\nendstream\nendobj\n"),
  );
  const offsets = objects.map((_, index) => {
    const marker = new TextEncoder().encode(`${index + 1} 0 obj`);
    return findSequence(body, marker);
  });
  offsets.push(findSequence(body, new TextEncoder().encode("4 0 obj")));
  const xrefOffset = body.byteLength;
  const xref = `xref\n0 5\n0000000000 65535 f \n${offsets.map((value) => `${xrefEntry(value)}\n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(body, new TextEncoder().encode(xref));
}

function zeroComponentJpegBytes() {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x01, 0x00, 0x01, 0x00,
    0xff, 0xda, 0x00, 0x06, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9,
  ]);
}

function incrementalJavaScriptPdfBytes() {
  const base = classicPdfBytes("", []);
  const baseText = new TextDecoder().decode(base);
  const previousXref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(baseText)?.[1]);
  if (!Number.isSafeInteger(previousXref)) throw new Error("Expected a classic PDF base fixture.");

  const updateObject = "1 1 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>\nendobj\n";
  const actionObject = "3 0 obj\n<< /S /JavaScript /JS (app.alert\\(\\\"updated\\\"\\)) >>\nendobj\n";
  const updateStart = base.length;
  const actionStart = updateStart + byteLength(updateObject);
  const xrefOffset = actionStart + byteLength(actionObject);
  const update = `${updateObject}${actionObject}xref\n1 1\n${xrefEntry(updateStart, 1)}\n3 1\n${xrefEntry(actionStart)}\ntrailer\n<< /Size 4 /Root 1 1 R /Prev ${previousXref} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(base, new TextEncoder().encode(update));
}

function xrefStreamJavaScriptPdfBytes() {
  const header = "%PDF-1.5\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
    "3 0 obj\n<< /S /JavaScript /JS (app.alert\\(\\\"xref-stream\\\"\\)) >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let offset = byteLength(header);
  for (const object of objects) {
    offsets.push(offset);
    offset += byteLength(object);
  }
  const xrefOffset = offset;
  const entries = new Uint8Array(5 * 7);
  writeXrefEntry(entries, 0, 0, 0, 65535);
  writeXrefEntry(entries, 7, 1, offsets[0], 0);
  writeXrefEntry(entries, 14, 1, offsets[1], 0);
  writeXrefEntry(entries, 21, 1, offsets[2], 0);
  writeXrefEntry(entries, 28, 1, xrefOffset, 0);
  const xrefPrefix = `4 0 obj\n<< /Type /XRef /Size 5 /Root 1 0 R /W [1 4 2] /Index [0 5] /Length ${entries.length} >>\nstream\n`;
  const suffix = `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(
    new TextEncoder().encode(header),
    ...objects.map((object) => new TextEncoder().encode(object)),
    new TextEncoder().encode(xrefPrefix),
    entries,
    new TextEncoder().encode(suffix),
  );
}

function objectStreamJavaScriptPdfBytes() {
  const header = "%PDF-1.5\n";
  const action = "<< /S /JavaScript /JS (app.alert\\(\\\"object-stream\\\"\\)) >>";
  const objectStreamData = `3 0 ${action}`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let offset = byteLength(header);
  for (const object of objects) {
    offsets.push(offset);
    offset += byteLength(object);
  }
  const objectStreamOffset = offset;
  const objectStream = `4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length ${byteLength(objectStreamData)} >>\nstream\n${objectStreamData}\nendstream\nendobj\n`;
  offset += byteLength(objectStream);
  const xrefOffset = offset;
  const entries = new Uint8Array(6 * 7);
  writeXrefEntry(entries, 0, 0, 0, 65535);
  writeXrefEntry(entries, 7, 1, offsets[0], 0);
  writeXrefEntry(entries, 14, 1, offsets[1], 0);
  writeXrefEntry(entries, 21, 2, 4, 0);
  writeXrefEntry(entries, 28, 1, objectStreamOffset, 0);
  writeXrefEntry(entries, 35, 1, xrefOffset, 0);
  const xrefPrefix = `5 0 obj\n<< /Type /XRef /Size 6 /Root 1 0 R /W [1 4 2] /Index [0 6] /Length ${entries.length} >>\nstream\n`;
  const suffix = `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate(
    new TextEncoder().encode(header),
    ...objects.map((object) => new TextEncoder().encode(object)),
    new TextEncoder().encode(objectStream),
    new TextEncoder().encode(xrefPrefix),
    entries,
    new TextEncoder().encode(suffix),
  );
}

function compressedExpansionPdfBytes() {
  const expanded = new TextEncoder().encode("q 0 0 1 1 re f Q\n".repeat(80_000));
  const compressed = new Uint8Array(deflateSync(expanded));
  const encoded = Buffer.from(compressed).toString("hex");
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${encoded.length + 1} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n${encoded}>\nendstream`,
  ]);
}

function cumulativeCompressedExpansionPdfBytes() {
  const expanded = new Uint8Array(1024 * 1024).fill(0x20);
  const compressed = new Uint8Array(deflateSync(expanded));
  const encoded = Buffer.from(compressed).toString("hex");
  const streams = Array.from(
    { length: 33 },
    () => `<< /Length ${encoded.length + 1} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n${encoded}>\nendstream`,
  );
  const contents = streams.map((_, index) => `${index + 4} 0 R`).join(" ");
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Contents [${contents}] >>`,
    ...streams,
  ]);
}

function cumulativeTokenPdfBytes() {
  const largeArray = `[${"0 ".repeat(15_000)}]`;
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [] /Count 0 >>",
    ...Array.from({ length: 20 }, () => largeArray),
  ]);
}

function overlappingXrefPdfBytes() {
  const header = "%PDF-1.7\n";
  const first = "1 0 obj\n<< /Producer (obsolete) >>\nendobj\n";
  const catalog = "1 1 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const pages = "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n";
  const firstOffset = byteLength(header);
  const catalogOffset = firstOffset + byteLength(first);
  const pagesOffset = catalogOffset + byteLength(catalog);
  const xrefOffset = pagesOffset + byteLength(pages);
  const xref = `xref\n1 1\n${xrefEntry(firstOffset)}\n1 1\n${xrefEntry(catalogOffset, 1)}\n2 1\n${xrefEntry(pagesOffset)}\ntrailer\n<< /Size 3 /Root 1 1 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(`${header}${first}${catalog}${pages}${xref}`);
}

function outOfRangeFreeXrefEntryPdfBytes() {
  const text = new TextDecoder().decode(classicPdfBytes("", []));
  return new TextEncoder().encode(
    text.replace("trailer\n", "5 1\n0000000000 00000 f \ntrailer\n"),
  );
}

function malformedStreamLengthPdfBytes() {
  return pdfBytes([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 2048 >>\nstream\nq Q\nendstream",
  ]);
}

function pdfBytes(objects: readonly string[]) {
  return pdfBytesWithTrailerEntries(objects, "");
}

function pdfBytesWithTrailerEntries(objects: readonly string[], trailerEntries: string) {
  const header = "%PDF-1.7\n";
  let body = header;
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${xrefEntry(offset)}\n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerEntries} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function streamObject(dictionaryEntries: string, data: string) {
  return `<< ${dictionaryEntries} /Length ${byteLength(data)} >>\nstream\n${data}\nendstream`;
}

function xrefEntry(offset: number, generation = 0) {
  return `${String(offset).padStart(10, "0")} ${String(generation).padStart(5, "0")} n `;
}

function writeXrefEntry(bytes: Uint8Array, offset: number, type: number, field2: number, field3: number) {
  bytes[offset] = type;
  new DataView(bytes.buffer).setUint32(offset + 1, field2);
  new DataView(bytes.buffer).setUint16(offset + 5, field3);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function pngBytes(withIdat = true) {
  const chunks = [
    pngChunk("IHDR", new Uint8Array([
      0, 0, 0, 1,
      0, 0, 0, 1,
      8, 2, 0, 0, 0,
    ])),
    ...(withIdat ? [pngChunk("IDAT", new Uint8Array([1]))] : []),
    pngChunk("IEND", new Uint8Array()),
  ];
  return concatenate(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunks,
  );
}

function pngChunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  return bytes;
}

function jpegBytes(withScan = true) {
  const sof = new Uint8Array([
    0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ]);
  if (!withScan) return concatenate(new Uint8Array([0xff, 0xd8]), sof, new Uint8Array([0xff, 0xd9]));
  const sos = new Uint8Array([
    0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  ]);
  return concatenate(
    new Uint8Array([0xff, 0xd8]),
    sof,
    sos,
    new Uint8Array([0x01, 0xff, 0xd9]),
  );
}

function webpBytes(validLength = true) {
  const payload = new Uint8Array([
    0x00, 0x00, 0x00,
    0x9d, 0x01, 0x2a,
    0x01, 0x00, 0x01, 0x00,
  ]);
  const bytes = new Uint8Array(12 + 8 + payload.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, validLength ? bytes.length - 8 : bytes.length - 9, true);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  view.setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

function webpExtendedHeaderOnly() {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  view.setUint32(16, 10, true);
  return bytes;
}

function concatenate(...parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function corruptPngBytes() {
  const bytes = validPngBytes();
  const corrupt = bytes.slice();
  const idat = new TextEncoder().encode("IDAT");
  const marker = findSequence(corrupt, idat);
  corrupt[marker + 4] ^= 0xff;
  return corrupt;
}

function findSequence(bytes: Uint8Array, sequence: Uint8Array) {
  for (let offset = 0; offset <= bytes.length - sequence.length; offset += 1) {
    if (sequence.every((value, index) => bytes[offset + index] === value)) return offset;
  }
  throw new Error("Sequence not found.");
}
