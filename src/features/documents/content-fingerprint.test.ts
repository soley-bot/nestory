import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/features/documents/content-fingerprint";

describe("document content fingerprint", () => {
  it("hashes the exact byte sequence as lowercase SHA-256 hex", async () => {
    const bytes = new TextEncoder().encode("Nestory opening evidence\n");

    await expect(sha256Hex(bytes)).resolves.toBe(
      "a76024b36f70838462fca9268bac5c13bf23ee0c6e0c6fa1b9dceb1d5a7f4aa6",
    );
  });

  it("distinguishes byte changes that metadata such as name and size cannot prove", async () => {
    const first = new TextEncoder().encode("ABCD");
    const second = new TextEncoder().encode("ABCE");

    expect(first.byteLength).toBe(second.byteLength);
    await expect(sha256Hex(first)).resolves.not.toBe(await sha256Hex(second));
  });
});
