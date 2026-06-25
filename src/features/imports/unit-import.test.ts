import { describe, expect, it } from "vitest";
import {
  autoMapUnitImportHeaders,
  buildUnitImportPreviewRows,
  parseCsv,
  toCommitRows,
} from "@/features/imports/unit-import";
import type { ImportPropertyOption } from "@/features/imports/import.types";

const properties: ImportPropertyOption[] = [
  {
    code: "CTR",
    id: "11111111-1111-4111-8111-111111111111",
    label: "CTR - Central Residence",
    name: "Central Residence",
  },
];

describe("unit import", () => {
  it("parses quoted CSV cells and auto-maps common unit headers", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no. / Floor,Price,Currency,Status,Remark",
        'CTR,"12A / 12","1,200",USD,Available,"Corner unit, clean"',
      ].join("\n"),
    );
    const mapping = autoMapUnitImportHeaders(parsed.headers);
    const rows = buildUnitImportPreviewRows({
      mapping,
      properties,
      records: parsed.records,
    });

    expect(mapping.property).toBe("Property Code");
    expect(mapping.unitNumber).toBe("Unit no. / Floor");
    expect(rows[0]).toMatchObject({
      currentRentAmount: 1200,
      currentRentCurrency: "USD",
      floor: "12",
      propertyId: properties[0].id,
      status: "vacant",
      unitNumber: "12A",
    });
    expect(toCommitRows(rows)).toHaveLength(1);
  });

  it("flags rows that do not match an active property", () => {
    const parsed = parseCsv(
      ["Property Code,Unit no. / Floor,Price,Currency", "MISS,9B,700,USD"].join(
        "\n",
      ),
    );
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });

    expect(rows[0].issues.some((issue) => issue.level === "error")).toBe(true);
    expect(toCommitRows(rows)).toHaveLength(0);
  });
});

