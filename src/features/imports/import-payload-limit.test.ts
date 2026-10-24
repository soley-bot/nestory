import { describe, expect, it } from "vitest";
import { getImportPayloadError, MAX_IMPORT_PAYLOAD_BYTES } from "./import-payload-limit";

describe("import payload byte limit", () => {
  it("accepts the exact UTF-8 boundary and rejects one additional byte", () => {
    const payload = JSON.stringify("é".repeat((MAX_IMPORT_PAYLOAD_BYTES - 2) / 2));
    expect(new TextEncoder().encode(payload).byteLength).toBe(MAX_IMPORT_PAYLOAD_BYTES);
    expect(getImportPayloadError(payload)).toBeNull();
    expect(getImportPayloadError(`${payload} `)).toContain("Split the CSV");
  });

  it("catches JSON amplification from repeated long column headers", () => {
    const headers = Array.from({ length: 100 }, (_, index) => `${index}-${"h".repeat(110)}`);
    const raw = Object.fromEntries(headers.map(header => [header, "x"]));
    const csv = [headers.join(","), ...Array.from({ length: 500 }, () => headers.map(() => "x").join(","))].join("\n");
    const payload = JSON.stringify({ records: Array.from({ length: 500 }, (_, index) => ({ raw, rowNumber: index + 2 })) });
    expect(new TextEncoder().encode(csv).byteLength).toBeLessThan(MAX_IMPORT_PAYLOAD_BYTES);
    expect(getImportPayloadError(payload)).toContain("Split the CSV");
  });
});
