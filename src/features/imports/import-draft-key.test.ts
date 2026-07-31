import { describe, expect, it } from "vitest";

import { buildImportDraftKey } from "@/features/imports/import-draft-key";

describe("buildImportDraftKey", () => {
  it("changes when CSV content changes despite identical file metadata and shape", () => {
    const input = {
      fileName: "properties.csv",
      headers: ["Property Code", "Property Name"],
      importType: "properties" as const,
      mapping: {
        code: "Property Code",
        name: "Property Name",
      },
    };

    const first = buildImportDraftKey({
      ...input,
      records: [
        {
          raw: { "Property Code": "P1", "Property Name": "First" },
          rowNumber: 2,
        },
      ],
    });
    const second = buildImportDraftKey({
      ...input,
      records: [
        {
          raw: { "Property Code": "P2", "Property Name": "Other" },
          rowNumber: 2,
        },
      ],
    });

    expect(first).not.toBe(second);
    expect(first.length).toBeLessThan(2000);
  });

  it("is deterministic for the same mapped records", () => {
    const input = {
      fileName: "units.csv",
      headers: ["Unit"],
      importType: "units" as const,
      mapping: { unitNumber: "Unit" },
      records: [{ raw: { Unit: "A1" }, rowNumber: 2 }],
    };

    expect(buildImportDraftKey(input)).toBe(buildImportDraftKey(input));
  });
});
