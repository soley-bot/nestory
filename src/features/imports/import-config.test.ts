import { describe, expect, it } from "vitest";
import {
  autoMapImportHeaders,
  buildGenericImportPreviewRows,
  buildImportTemplateCsv,
  getGenericImportStats,
} from "@/features/imports/import-config";
import type { ImportReferenceData } from "@/features/imports/import.types";
import { parseCsv } from "@/features/imports/unit-import";

const referenceData: ImportReferenceData = {
  people: [
    {
      displayName: "Sok Dara",
      id: "33333333-3333-4333-8333-333333333333",
      label: "Sok Dara (tenant@example.com)",
      primaryEmail: "tenant@example.com",
      roles: ["tenant"],
    },
  ],
  properties: [
    {
      code: "CTR",
      id: "11111111-1111-4111-8111-111111111111",
      label: "CTR - Central Residence",
      name: "Central Residence",
    },
  ],
  units: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      label: "CTR - 12A",
      propertyCode: "CTR",
      propertyId: "11111111-1111-4111-8111-111111111111",
      unitNumber: "12A",
    },
  ],
};

describe("import config", () => {
  it("builds property templates and create/update previews", () => {
    const template = buildImportTemplateCsv("properties");
    const parsed = parseCsv(
      [
        "Property Code,Property Name,Property Type,Status",
        "CTR,Central Residence,Apartment,Active",
        "RIV,River Place,Condo,Under Renovation",
      ].join("\n"),
    );
    const mapping = autoMapImportHeaders("properties", parsed.headers);
    const rows = buildGenericImportPreviewRows({
      mapping,
      records: parsed.records,
      referenceData,
      type: "properties",
    });

    expect(template).toContain("Property Code,Property Name");
    expect(mapping).toMatchObject({
      code: "Property Code",
      name: "Property Name",
    });
    expect(rows[0]).toMatchObject({
      actionLabel: "Update",
      statusLabel: "Update",
      targetLabel: "CTR - Central Residence",
    });
    expect(rows[1]).toMatchObject({
      actionLabel: "Create",
      primaryLabel: "RIV",
      statusLabel: "Create",
      targetLabel: "New property",
    });
    expect(getGenericImportStats(rows)).toMatchObject({
      errorCount: 0,
      readyCount: 2,
    });
  });

  it("prefills unit templates with existing property anchors", () => {
    const template = buildImportTemplateCsv("units", referenceData);

    expect(template.split("\r\n")).toEqual([
      "Property Code,Property Name,Unit no. / Floor,Type,Inclusion,Price,Status,Remark",
      "CTR,Central Residence,12A,,,,,",
    ]);
  });

  it("prefills lease templates with existing unit anchors", () => {
    const template = buildImportTemplateCsv("leases", referenceData);

    expect(template.split("\r\n")).toEqual([
      "Property Code,Unit no.,Tenant Email,Tenant Name,Start Date,End Date,Monthly Rent,Deposit,Status",
      "CTR,12A,,,,,,,Active",
    ]);
  });

  it("normalizes people roles for tenant imports", () => {
    const parsed = parseCsv(
      [
        "Display Name,Roles,Party Type,Email,Phone",
        "New Tenant,tenant; owner,Individual,new@example.com,+855 12",
      ].join("\n"),
    );
    const [row] = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("people", parsed.headers),
      records: parsed.records,
      referenceData,
      type: "people",
    });

    expect(row).toMatchObject({
      primaryLabel: "New Tenant",
      secondaryLabel: "tenant, owner",
      statusLabel: "Create",
    });
    expect(row.normalizedData).toMatchObject({
      roles: ["tenant", "owner"],
    });
  });

  it("blocks duplicate non-unit rows before staging", () => {
    const parsed = parseCsv(
      [
        "Property Code,Property Name,Property Type,Status",
        "RIV,River Place,Condo,Active",
        "riv,River Place Duplicate,Condo,Active",
      ].join("\n"),
    );
    const rows = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("properties", parsed.headers),
      records: parsed.records,
      referenceData,
      type: "properties",
    });

    expect(rows.every((row) => row.actionLabel === "Needs review")).toBe(true);
    expect(rows[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message:
            "Duplicate properties import rows: rows 2, 3. Keep one row before committing.",
        }),
      ]),
    );
  });

  it("requires matched properties, units, and people before leases commit", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no.,Tenant Email,Tenant Name,Start Date,End Date,Monthly Rent,Deposit,Status",
        "CTR,12A,tenant@example.com,Sok Dara,2026-01-01,2026-12-31,850,850,Active",
        "CTR,12A,missing@example.com,Missing Tenant,2026-01-01,2026-12-31,850,850,Active",
      ].join("\n"),
    );
    const rows = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("leases", parsed.headers),
      records: parsed.records,
      referenceData,
      type: "leases",
    });

    expect(rows[0]).toMatchObject({
      actionLabel: "Create",
      amountLabel: "USD 850",
      statusLabel: "active",
    });
    expect(rows[1].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionHref: "/people?action=create",
          actionLabel: "Add person",
          level: "error",
          message: "Tenant must already exist in People before importing leases.",
        }),
      ]),
    );
    expect(getGenericImportStats(rows)).toMatchObject({
      errorCount: 1,
      readyCount: 1,
    });
  });
});
