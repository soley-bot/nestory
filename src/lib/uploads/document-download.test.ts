import { describe, expect, it } from "vitest";

import {
  documentDownloadUrl,
  sanitizeAttachmentFilename,
} from "@/lib/uploads/document-download";

describe("document download boundary", () => {
  it("builds an app-origin URL from the opaque document id", () => {
    expect(documentDownloadUrl("44444444-4444-4444-8444-444444444444")).toBe(
      "/api/documents/44444444-4444-4444-8444-444444444444",
    );
  });

  it("removes path, header, control, and non-ASCII characters from attachment names", () => {
    expect(sanitizeAttachmentFilename('lease/..\\signed:\"សួស្តី\r\nX-Evil: yes?.pdf')).toBe(
      "lease-..-signed---X-Evil- yes-.pdf",
    );
  });

  it("uses a neutral fallback for an empty filename", () => {
    expect(sanitizeAttachmentFilename("\r\n/\\")).toBe("document");
  });
});
