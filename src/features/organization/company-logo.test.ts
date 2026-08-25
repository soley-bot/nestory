import { describe, expect, it } from "vitest";

import {
  getCompanyLogoStoragePath,
  validateCompanyLogo,
} from "@/features/organization/company-logo";
import { validJpegBytes, validPngBytes } from "@/test-utils/upload-content";

describe("validateCompanyLogo", () => {
  it("accepts a PNG whose signature and dimensions are valid", async () => {
    const result = await validateCompanyLogo(
      new File([validPngBytes(512, 256)], "company.png", { type: "image/png" }),
    );

    expect(result).toMatchObject({
      bytes: expect.any(Uint8Array),
      contentType: "image/png",
      extension: "png",
    });
  });

  it("accepts a JPEG whose signature and dimensions are valid", async () => {
    const result = await validateCompanyLogo(
      new File([validJpegBytes(640, 320)], "company.jpg", { type: "image/jpeg" }),
    );

    expect(result).toMatchObject({
      bytes: expect.any(Uint8Array),
      contentType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("rejects a claimed PNG whose file signature is JPEG", async () => {
    const result = await validateCompanyLogo(
      new File([validJpegBytes(640, 320)], "spoofed.png", { type: "image/png" }),
    );

    expect(result).toEqual({ error: "The file content does not match its image type." });
  });

  it("rejects logos outside the supported dimension range", async () => {
    const result = await validateCompanyLogo(
      new File([validPngBytes(64, 64)], "small.png", { type: "image/png" }),
    );

    expect(result).toEqual({ error: "Logo dimensions must be between 128 and 4096 pixels." });
  });

  it("generates a versioned object path without using the original filename", () => {
    const path = getCompanyLogoStoragePath(
      "00000000-0000-4000-8000-000000000001",
      "png",
    );

    expect(path).toMatch(
      /^00000000-0000-4000-8000-000000000001\/logos\/[0-9a-f-]{36}\.png$/,
    );
    expect(path).not.toContain("company");
  });
});
