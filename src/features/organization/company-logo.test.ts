import { describe, expect, it } from "vitest";

import {
  getCompanyLogoStoragePath,
  validateCompanyLogo,
} from "@/features/organization/company-logo";

describe("validateCompanyLogo", () => {
  it("accepts a PNG whose signature and dimensions are valid", async () => {
    const result = await validateCompanyLogo(
      new File([pngBytes(512, 256)], "company.png", { type: "image/png" }),
    );

    expect(result).toEqual({ extension: "png" });
  });

  it("accepts a JPEG whose signature and dimensions are valid", async () => {
    const result = await validateCompanyLogo(
      new File([jpegBytes(640, 320)], "company.jpg", { type: "image/jpeg" }),
    );

    expect(result).toEqual({ extension: "jpg" });
  });

  it("rejects a claimed PNG whose file signature is JPEG", async () => {
    const result = await validateCompanyLogo(
      new File([jpegBytes(640, 320)], "spoofed.png", { type: "image/png" }),
    );

    expect(result).toEqual({ error: "The file content does not match its image type." });
  });

  it("rejects logos outside the supported dimension range", async () => {
    const result = await validateCompanyLogo(
      new File([pngBytes(64, 64)], "small.png", { type: "image/png" }),
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

function pngBytes(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpegBytes(width: number, height: number) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x08,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01,
    0xff, 0xd9,
  ]);
}
