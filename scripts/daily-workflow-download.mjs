import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
const MAX_BYTES = 20 * 1024 * 1024;

// App routes serve verified bytes directly. There is no signed-storage redirect
// in this journey. Use the browser's authenticated transport, never copied cookies
// or relaxed Secure flags, and reject every redirect before following it.
export async function downloadDailyArtifact(page, base, href, metadata, { timeoutMs = 20000 } = {}) {
  assert.ok(href, "Published artifact must have a visible download link");
  let url;
  let pageOrigin;
  try { url = new URL(href, base); pageOrigin = new URL(page.url()).origin; }
  catch { throw new Error("Invalid artifact or page URL"); }
  assert.ok(pageOrigin === base, "Download page must be the attested app origin");
  assert.ok(url.origin === base, "Artifact must use the app origin");
  assert.ok(!url.username && !url.password && !url.hash, "Unexpected artifact URL components");
  assert.ok(UUID.test(metadata.id ?? ""), "Expected a published artifact identity");
  const format = metadata.format ?? "pdf";
  assert.ok(Object.hasOwn(TYPES, format), "Unsupported artifact format");
  const receipt = format === "pdf" && url.pathname === `/api/finance/documents/${metadata.id}` && !url.search;
  const report = url.pathname === `/api/reports/${format === "xlsx" ? "excel" : "pdf"}`
    && url.searchParams.size === 1 && url.searchParams.get("artifactId") === metadata.id;
  assert.ok(receipt || report, "Unexpected artifact route or identity");
  const size = Number(metadata.size_bytes);
  assert.ok(Number.isSafeInteger(size) && size > 0 && size <= MAX_BYTES, "Invalid artifact byte bound");
  assert.ok(/^[a-f0-9]{64}$/.test(metadata.sha256 ?? ""), "Invalid artifact digest");
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000, "Invalid download deadline");

  let result;
  try {
    result = await page.evaluate(async ({ href, size, contentType, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(href, { credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal });
        if (response.status !== 200) return { failure: "http_status", status: response.status };
        if (response.redirected || response.url !== href) return { failure: "unexpected_destination" };
        if (response.headers.get("content-type")?.split(";")[0].trim() !== contentType) return { failure: "content_type" };
        if (!/^attachment(?:;|$)/i.test(response.headers.get("content-disposition") ?? "")) return { failure: "not_attachment" };
        const declaredSize = response.headers.get("content-length");
        if (declaredSize !== null && Number(declaredSize) !== size) return { failure: "declared_size" };
        if (!response.body) return { failure: "empty_body" };
        const reader = response.body.getReader();
        const chunks = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > size) { await reader.cancel(); return { failure: "body_size" }; }
          chunks.push(value);
        }
        if (length !== size) return { failure: "body_size" };
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { bytes: Array.from(bytes) };
      } catch {
        // Never retain response bodies, cookies, signed URLs or fetch exceptions.
        return { failure: controller.signal.aborted ? "deadline" : "network_or_redirect" };
      } finally { clearTimeout(timer); controller.abort(); }
    }, { href: url.href, size, contentType: TYPES[format], timeoutMs });
  } catch {
    throw new Error("Artifact download failed before response verification");
  }
  assert.ok(!result.failure, `Artifact download failed: ${result.failure}${result.status ? ` (HTTP ${result.status})` : ""}`);
  const bytes = Buffer.from(result.bytes);
  assert.equal(bytes.length, size, "Artifact byte count differs");
  if (format === "pdf") {
    assert.ok(bytes.subarray(0, 5).toString("ascii") === "%PDF-", "Artifact is not a PDF");
    assert.ok(bytes.subarray(-1024).toString("latin1").trimEnd().endsWith("%%EOF"), "PDF is incomplete");
  } else {
    assert.equal(bytes.subarray(0, 4).toString("hex"), "504b0304", "Artifact is not an XLSX archive");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, metadata.sha256, "Artifact digest differs");
  return digest;
}
