import { describe, expect, it } from "vitest";
import {
  autoMapUnitImportHeaders,
  buildUnitImportPreviewRows,
  getUnitImportCleanupItems,
  mergeUnitImportUpdate,
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
        "Property Code,Unit no. / Floor,Price,Status,Remark",
        'CTR,"12A / 12","1,200",Available,"Corner unit, clean"',
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
      floor: "12",
      mappedFields: {
        currentRentAmount: true,
        floor: true,
        sizeSqm: false,
        status: true,
      },
      propertyId: properties[0].id,
      status: "vacant",
      unitNumber: "12A",
    });
    expect(toCommitRows(rows)).toHaveLength(1);
  });

  it("keeps row values aligned when a spreadsheet has blank columns", () => {
    const parsed = parseCsv(
      ["Property Code,,Unit no. / Floor,Price", "CTR,,12A / 12,850"].join(
        "\n",
      ),
    );
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });

    expect(rows[0]).toMatchObject({
      currentRentAmount: 850,
      floor: "12",
      propertyId: properties[0].id,
      unitNumber: "12A",
    });
    expect(toCommitRows(rows)).toHaveLength(1);
  });

  it("flags duplicate unit rows before commit", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no. / Floor,Price",
        "CTR,12A / 12,850",
        "CTR,12a / 12,900",
      ].join("\n"),
    );
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.actionLabel === "Needs review")).toBe(true);
    expect(
      rows.every((row) =>
        row.issues.some((issue) =>
          issue.message.includes("Duplicate unit import rows"),
        ),
      ),
    ).toBe(true);
    expect(toCommitRows(rows)).toHaveLength(0);
  });

  it("preserves existing unit fields when sparse import rows update a unit", () => {
    const parsed = parseCsv(["Property Code,Unit no.", "CTR,12A"].join("\n"));
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });
    const [commitRow] = toCommitRows(rows);

    expect(
      mergeUnitImportUpdate(commitRow, {
        currentRentAmount: 900,
        currentRentCurrency: "USD",
        floor: "12",
        sizeSqm: 55,
        status: "occupied",
      }),
    ).toEqual({
      currentRentAmount: 900,
      currentRentCurrency: "USD",
      floor: "12",
      sizeSqm: 55,
      status: "occupied",
    });
  });

  it("warns when rent is missing but still allows commit", () => {
    const parsed = parseCsv(["Property Code,Unit no.", "CTR,12A"].join("\n"));
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });

    expect(rows[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionHref:
            "/units?propertyId=11111111-1111-4111-8111-111111111111&query=12A",
          actionLabel: "Review unit rent",
          level: "warning",
          message:
            "Price column is not mapped; unit will import without current rent.",
        }),
      ]),
    );
    expect(toCommitRows(rows)).toHaveLength(1);
  });

  it("flags rows that do not match an active property", () => {
    const parsed = parseCsv(
      ["Property Code,Unit no. / Floor,Price", "MISS,9B,700"].join("\n"),
    );
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });

    expect(rows[0].issues.some((issue) => issue.level === "error")).toBe(true);
    expect(toCommitRows(rows)).toHaveLength(0);
  });

  it("blocks ambiguous property matches before commit", () => {
    const parsed = parseCsv(
      ["Property Code,Unit no. / Floor,Price", "CTR,9B,700"].join("\n"),
    );
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties: [
        ...properties,
        {
          code: "CTR",
          id: "22222222-2222-4222-8222-222222222222",
          label: "CTR - City Tower",
          name: "City Tower",
        },
      ],
      records: parsed.records,
    });

    expect(rows[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionHref: "/properties?query=CTR",
          actionLabel: "Review properties",
          level: "error",
          message:
            'Property "CTR" matches multiple active properties: CTR - Central Residence, CTR - City Tower.',
        }),
      ]),
    );
    expect(toCommitRows(rows)).toHaveLength(0);
  });

  it("builds a cleanup queue from preview issues", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no. / Floor,Type,Inclusion",
        "MISS,,Studio,Furnished",
      ].join("\n"),
    );
    const rows = buildUnitImportPreviewRows({
      mapping: autoMapUnitImportHeaders(parsed.headers),
      properties,
      records: parsed.records,
    });
    const items = getUnitImportCleanupItems(rows);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionHref: "/properties?action=create",
          actionLabel: "Add property",
          level: "error",
          message: 'Property "MISS" does not match an active property.',
          propertyLabel: "MISS",
          sourceRowNumber: 2,
          unitNumber: "Not mapped",
        }),
        expect.objectContaining({
          level: "warning",
          message: "Type is preview-only until the unit schema stores it.",
        }),
      ]),
    );
  });
});
