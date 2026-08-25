import { describe, expect, it } from "vitest";

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
});

function markerOnlyPdfBytes() {
  return new TextEncoder().encode("%PDF-1.7\nnot a PDF document\n%%EOF\n");
}

function xrefStreamPdfBytes() {
  const encoder = new TextEncoder();
  let body = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n";
  const xrefOffset = encoder.encode(body).byteLength;
  body += "2 0 obj\n<< /Type /XRef /Size 4 /Root 1 0 R /W [1 2 1] /Length 4 >>\n";
  body += "stream\nxxxx\nendstream\nendobj\n";
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(body);
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
