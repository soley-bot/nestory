import { describe, expect, it } from "vitest";
import {
  autoMapImportHeaders,
  buildGenericImportPreviewRows,
  getGenericImportStats,
} from "@/features/imports/import-config";
import type { ImportReferenceData, ImportType } from "@/features/imports/import.types";
import { parseCsv } from "@/features/imports/unit-import";

const firstPersonId = "33333333-3333-4333-8333-333333333333";
const secondPersonId = "44444444-4444-4444-8444-444444444444";
const referenceData: ImportReferenceData = {
  leaseOccupancies: [],
  people: [
    {
      displayName: "Sok Dara",
      id: firstPersonId,
      label: "Sok Dara (first@example.com)",
      primaryEmail: "first@example.com",
      roles: ["tenant"],
    },
    {
      displayName: "Sok Dara",
      id: secondPersonId,
      label: "Sok Dara (second@example.com)",
      primaryEmail: "second@example.com",
      roles: ["tenant"],
    },
  ],
  properties: [{ code: "CTR", id: "property-1", label: "CTR", name: "Central" }],
  units: [{
    id: "unit-1",
    label: "CTR - 12A",
    propertyCode: "CTR",
    propertyId: "property-1",
    unitNumber: "12A",
  }],
};

function preview(type: ImportType, csv: string, references = referenceData) {
  const parsed = parseCsv(csv);
  return buildGenericImportPreviewRows({
    mapping: autoMapImportHeaders(type, parsed.headers),
    records: parsed.records,
    referenceData: references,
    type,
  });
}

function previewRaw(type: ImportType, raw: Record<string, string>, references = referenceData) {
  return buildGenericImportPreviewRows({
    mapping: autoMapImportHeaders(type, Object.keys(raw)),
    records: [{ raw, rowNumber: 2 }],
    referenceData: references,
    type,
  });
}

function leaseCsv(email: string, personId = "") {
  return [
    "Property Code,Unit no.,Tenant Email,Tenant Name,Tenant Person ID,Start Date,End Date,Monthly Rent,Due Day,Payment Frequency,Term Status,Status",
    `CTR,12A,${email},Sok Dara,${personId},2026-01-01,2026-12-31,850,10,Monthly,Active,Active`,
  ].join("\n");
}

describe("person import safety", () => {
  it("matches padded raw and stored identities with the preview's whitespace semantics", () => {
    const padding = "\t\u00a0\u2028\ufeff";
    const [row] = previewRaw("people", {
      "Display Name": `${padding}Sok Dara${padding}`,
      Roles: "tenant",
      Email: `${padding}SECOND@example.com${padding}`,
    }, {
      ...referenceData,
      people: referenceData.people.map((person) => ({
        ...person,
        displayName: `${padding}${person.displayName}${padding}`,
        primaryEmail: `${padding}${person.primaryEmail}${padding}`,
      })),
    });
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData.existingPersonId).toBe(secondPersonId);
    expect(row.normalizedData.primaryEmail).toBe("SECOND@example.com");
  });

  it("resolves a padded explicit person ID before a replacement email", () => {
    const [row] = previewRaw("people", {
      "Display Name": "Sok Dara",
      Roles: "tenant",
      "Person ID": `\t\u00a0${secondPersonId}\ufeff`,
      Email: "replacement@example.com",
    });
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData.existingPersonId).toBe(secondPersonId);
    expect(row.normalizedData.primaryEmail).toBe("replacement@example.com");
  });

  it("previews whitespace-only optional cells as clears while preserving party type", () => {
    const [row] = previewRaw("people", {
      "Display Name": "Sok Dara",
      Roles: "tenant",
      "Person ID": secondPersonId,
      Email: "\t",
      Phone: "\u00a0",
      "Legal Name": "\ufeff",
      "Tax ID": "\u2028",
      Notes: "\t\u00a0\u2028\ufeff",
      "Party Type": "\t\u00a0\u2028\ufeff",
    });
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData).toMatchObject({
      primaryEmail: null, primaryPhone: null, legalName: null, taxIdentifier: null, notes: null,
    });
    expect(row.normalizedData).not.toHaveProperty("partyType");
    expect(row.issues).toContainEqual(expect.objectContaining({
      level: "warning",
      message: "Will clear: Email, Phone, Legal name, Tax ID, Notes.",
    }));
    expect(row.issues).toContainEqual(expect.objectContaining({
      level: "warning",
      message: "Blank party type keeps the existing type.",
    }));
  });

  it("maps an explicit person ID before broad name aliases regardless of header order", () => {
    const [row] = preview("people", `Person ID,Display Name,Roles\n${secondPersonId},Sok Dara,tenant`);
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData.existingPersonId).toBe(secondPersonId);
    expect(row.normalizedData.displayName).toBe("Sok Dara");
  });

  it("selects the matching email among people with the same display name", () => {
    const [row] = preview("people", "Display Name,Roles,Email\nSok Dara,tenant, SECOND@example.com ");
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData.existingPersonId).toBe(secondPersonId);
  });

  it("creates a distinct person when a supplied email misses a same-name person", () => {
    const [row] = preview("people", "Display Name,Roles,Email\nSok Dara,tenant,new@example.com");
    expect(row.actionLabel).toBe("Create");
    expect(row.normalizedData.existingPersonId).toBeNull();
  });

  it("requires an explicit person ID when a name matches multiple people", () => {
    const [row] = preview("people", "Display Name,Roles\nSok Dara,tenant");
    expect(row.actionLabel).toBe("Needs review");
    expect(row.normalizedData.existingPersonId).toBeNull();
    expect(row.issues).toContainEqual(expect.objectContaining({
      level: "error",
      message: expect.stringContaining("Person ID"),
    }));
    expect(row.issues.some((issue) => issue.message.includes(secondPersonId))).toBe(true);
  });

  it("keeps unique name-only updates available", () => {
    const [row] = preview("people", "Display Name,Roles\nSok Dara,tenant", {
      ...referenceData,
      people: [referenceData.people[1]],
    });
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData.existingPersonId).toBe(secondPersonId);
  });

  it("blocks shared-email matches even when the supplied name matches one person", () => {
    const sharedEmailReferences = {
      ...referenceData,
      people: referenceData.people.map((person, index) => ({
        ...person,
        displayName: index ? "Other Tenant" : person.displayName,
        primaryEmail: "shared@example.com",
      })),
    };
    const [row] = preview("people", "Display Name,Roles,Email\nSok Dara,tenant,shared@example.com", sharedEmailReferences);
    expect(row.actionLabel).toBe("Needs review");
    expect(row.normalizedData.existingPersonId).toBeNull();
  });

  it("resolves shared identities explicitly and detects duplicate target IDs", () => {
    const sharedEmailReferences = {
      ...referenceData,
      people: referenceData.people.map((person) => ({ ...person, primaryEmail: "shared@example.com" })),
    };
    const rows = preview("people", [
      "Display Name,Roles,Email,Person ID",
      `Sok Dara,tenant,shared@example.com,${firstPersonId}`,
      `Sok Dara,tenant,shared@example.com,${secondPersonId}`,
    ].join("\n"), sharedEmailReferences);
    expect(getGenericImportStats(rows).readyCount).toBe(2);
    expect(rows.map((row) => row.normalizedData.existingPersonId)).toEqual([firstPersonId, secondPersonId]);

    const duplicateRows = preview("people", [
      "Display Name,Roles,Email,Person ID",
      `Renamed,tenant,new@example.com,${firstPersonId}`,
      `Sok Dara,tenant,first@example.com,${firstPersonId}`,
    ].join("\n"));
    expect(getGenericImportStats(duplicateRows).readyCount).toBe(0);
  });

  it("blocks unknown explicit IDs instead of falling back to email or name", () => {
    const [row] = preview("people", "Display Name,Roles,Email,Person ID\nSok Dara,tenant,first@example.com,missing");
    expect(row.actionLabel).toBe("Needs review");
    expect(row.normalizedData.existingPersonId).toBeNull();
  });

  it("allows an explicit ID to change or clear the selected person's email", () => {
    for (const email of ["changed@example.com", ""]) {
      const [row] = preview("people", `Display Name,Roles,Email,Person ID\nSok Dara,tenant,${email},${secondPersonId}`);
      expect(row.actionLabel).toBe("Update");
      expect(row.normalizedData.existingPersonId).toBe(secondPersonId);
      expect(row.normalizedData.primaryEmail).toBe(email || null);
    }
  });

  it("omits unmapped optional fields so updates preserve existing contact and company data", () => {
    const [row] = preview("people", `Display Name,Roles,Person ID\nSok Dara,tenant,${secondPersonId}`);
    expect(row.actionLabel).toBe("Update");
    for (const key of ["partyType", "primaryEmail", "primaryPhone", "legalName", "taxIdentifier", "notes"]) {
      expect(row.normalizedData).not.toHaveProperty(key);
    }
  });

  it("previews mapped nullable blanks as explicit clears", () => {
    const [row] = preview("people", `Display Name,Roles,Person ID,Email,Phone,Legal Name,Tax ID,Notes\nSok Dara,tenant,${secondPersonId},, ,,,`);
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData).toMatchObject({
      primaryEmail: null, primaryPhone: null, legalName: null, taxIdentifier: null, notes: null,
    });
    expect(row.issues).toContainEqual(expect.objectContaining({
      level: "warning",
      message: "Will clear: Email, Phone, Legal name, Tax ID, Notes.",
    }));
  });

  it("preserves an existing company type when its mapped party type is blank", () => {
    const [row] = preview("people", `Display Name,Roles,Person ID,Party Type\nSok Dara,tenant,${secondPersonId},`);
    expect(row.actionLabel).toBe("Update");
    expect(row.normalizedData).not.toHaveProperty("partyType");
    expect(row.issues).toContainEqual(expect.objectContaining({
      level: "warning",
      message: "Blank party type keeps the existing type.",
    }));
  });

  it("defaults only new people to individual and rejects invalid supplied party types", () => {
    const [created] = preview("people", "Display Name,Roles\nNew Person,tenant");
    expect(created.normalizedData.partyType).toBe("individual");
    const [invalid] = preview("people", `Display Name,Roles,Person ID,Party Type\nSok Dara,tenant,${secondPersonId},corporation?`);
    expect(invalid.actionLabel).toBe("Needs review");
  });
});

describe("lease tenant attribution", () => {
  it("resolves padded tenant ID and email consistently with the raw preview", () => {
    const padding = "\t\u00a0\u2028\ufeff";
    const raw = parseCsv(leaseCsv("second@example.com", secondPersonId)).records[0].raw;
    raw["Tenant Person ID"] = `${padding}${secondPersonId}${padding}`;
    raw["Tenant Email"] = `${padding}SECOND@example.com${padding}`;
    raw["Tenant Name"] = `${padding}Sok Dara${padding}`;
    const [row] = previewRaw("leases", raw, {
      ...referenceData,
      people: referenceData.people.map((person) => ({
        ...person,
        primaryEmail: `${padding}${person.primaryEmail}${padding}`,
      })),
    });
    expect(row.actionLabel).toBe("Create");
    expect(row.normalizedData.tenantPersonId).toBe(secondPersonId);
  });

  it("maps an explicit tenant ID before broad tenant name aliases regardless of header order", () => {
    const [row] = preview("leases", [
      "Tenant Person ID,Property Code,Unit no.,Tenant Name,Start Date,End Date,Monthly Rent,Due Day,Payment Frequency,Term Status,Status",
      `${secondPersonId},CTR,12A,Sok Dara,2026-01-01,2026-12-31,850,10,Monthly,Active,Active`,
    ].join("\n"));
    expect(row.actionLabel).toBe("Create");
    expect(row.normalizedData.tenantPersonId).toBe(secondPersonId);
  });

  it("selects the correct same-name tenant by email", () => {
    const [row] = preview("leases", leaseCsv("second@example.com"));
    expect(row.actionLabel).toBe("Create");
    expect(row.normalizedData.tenantPersonId).toBe(secondPersonId);
  });

  it.each(["missing@example.com", ""])("blocks an unmatched or ambiguous tenant identity (%s)", (email) => {
    const [row] = preview("leases", leaseCsv(email));
    expect(row.actionLabel).toBe("Needs review");
    expect(row.normalizedData.tenantPersonId).toBeNull();
  });

  it("requires explicit resolution of a shared tenant email", () => {
    const sharedEmailReferences = {
      ...referenceData,
      people: referenceData.people.map((person) => ({ ...person, primaryEmail: "shared@example.com" })),
    };
    const [blocked] = preview("leases", leaseCsv("shared@example.com"), sharedEmailReferences);
    expect(blocked.actionLabel).toBe("Needs review");
    expect(blocked.normalizedData.tenantPersonId).toBeNull();
    const [resolved] = preview("leases", leaseCsv("shared@example.com", secondPersonId), sharedEmailReferences);
    expect(resolved.actionLabel).toBe("Create");
    expect(resolved.normalizedData.tenantPersonId).toBe(secondPersonId);
  });

  it("blocks conflicting tenant ID and email instead of silently choosing either", () => {
    const [row] = preview("leases", leaseCsv("first@example.com", secondPersonId));
    expect(row.actionLabel).toBe("Needs review");
    expect(row.normalizedData.tenantPersonId).toBeNull();
  });
});
