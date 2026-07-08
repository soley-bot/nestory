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
  leaseOccupancies: [],
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
          actionHref: "/tenants?action=create",
          actionLabel: "Add tenant",
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

  it("blocks same-day lease date ranges before staging", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no.,Tenant Email,Tenant Name,Start Date,End Date,Monthly Rent,Status",
        "CTR,12A,tenant@example.com,Sok Dara,2026-01-01,2026-01-01,850,Active",
      ].join("\n"),
    );
    const rows = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("leases", parsed.headers),
      records: parsed.records,
      referenceData,
      type: "leases",
    });

    expect(rows[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "End date must be after start date.",
        }),
      ]),
    );
    expect(getGenericImportStats(rows)).toMatchObject({
      errorCount: 1,
      readyCount: 0,
    });
  });

  it("blocks lease imports when a unit already has open occupancy", () => {
    const leaseId = "44444444-4444-4444-8444-444444444444";
    const parsed = parseCsv(
      [
        "Property Code,Unit no.,Tenant Email,Tenant Name,Start Date,End Date,Monthly Rent,Status",
        "CTR,12A,tenant@example.com,Sok Dara,2026-01-01,2026-12-31,850,Active",
      ].join("\n"),
    );
    const rows = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("leases", parsed.headers),
      records: parsed.records,
      referenceData: {
        ...referenceData,
        leaseOccupancies: [
          {
            endDate: "2026-12-31",
            leaseId,
            startDate: "2026-01-01",
            status: "occupied",
            unitId: "22222222-2222-4222-8222-222222222222",
          },
        ],
      },
      type: "leases",
    });

    expect(rows[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionHref: `/leases?query=${leaseId}`,
          actionLabel: "Review lease",
          level: "error",
          message:
            'Unit "12A" already has an open occupied occupancy (2026-01-01 to 2026-12-31). End or cancel the existing lease before importing another open lease.',
        }),
      ]),
    );
  });

  it("allows ended historical leases even when a unit has open occupancy", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no.,Tenant Email,Tenant Name,Start Date,End Date,Monthly Rent,Status",
        "CTR,12A,tenant@example.com,Sok Dara,2025-01-01,2025-12-31,800,Ended",
      ].join("\n"),
    );
    const rows = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("leases", parsed.headers),
      records: parsed.records,
      referenceData: {
        ...referenceData,
        leaseOccupancies: [
          {
            endDate: "2026-12-31",
            leaseId: "44444444-4444-4444-8444-444444444444",
            startDate: "2026-01-01",
            status: "occupied",
            unitId: "22222222-2222-4222-8222-222222222222",
          },
        ],
      },
      type: "leases",
    });

    expect(rows[0]).toMatchObject({
      actionLabel: "Create",
      statusLabel: "ended",
    });
    expect(rows[0].issues).toHaveLength(0);
  });

  it("blocks overlapping open lease rows for the same unit in one import", () => {
    const parsed = parseCsv(
      [
        "Property Code,Unit no.,Tenant Email,Tenant Name,Start Date,End Date,Monthly Rent,Status",
        "CTR,12A,tenant@example.com,Sok Dara,2026-01-01,2026-06-30,850,Active",
        "CTR,12A,tenant@example.com,Sok Dara,2026-03-01,2026-12-31,900,Notice Given",
      ].join("\n"),
    );
    const rows = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders("leases", parsed.headers),
      records: parsed.records,
      referenceData,
      type: "leases",
    });

    expect(rows.every((row) => row.actionLabel === "Needs review")).toBe(true);
    expect(
      rows.every((row) =>
        row.issues.some((issue) =>
          issue.message.includes(
            "Lease import rows 2 and 3 would overlap for Unit 12A.",
          ),
        ),
      ),
    ).toBe(true);
    expect(getGenericImportStats(rows)).toMatchObject({
      errorCount: 2,
      readyCount: 0,
    });
  });
});
