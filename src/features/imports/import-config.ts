import type {
  GenericImportPreviewRow,
  ImportFieldDefinition,
  ImportMapping,
  ImportReferenceData,
  ImportType,
  UnitImportCleanupItem,
  UnitImportIssue,
  UnitImportMapping,
} from "@/features/imports/import.types";
import {
  buildUnitImportPreviewRows,
  getUnitImportCleanupItems,
  toCommitRows,
  unitImportFields,
} from "@/features/imports/unit-import";

type ImportTypeConfig = {
  description: string;
  fields: ImportFieldDefinition[];
  label: string;
  nextDependency?: string;
  template: string[][];
};

// ponytail: cap inline data-url templates to keep downloads instant; upgrade to
// a streamed route if operators need thousands of prefilled reference rows.
const templateReferenceRowLimit = 100;

export const importTypeOrder: ImportType[] = [
  "properties",
  "units",
  "people",
  "leases",
];

export const importTypeConfigs: Record<ImportType, ImportTypeConfig> = {
  leases: {
    description:
      "Link tenants to units with dates, rent, deposits, and active status.",
    fields: [
      { key: "property", label: "Property", required: true },
      { key: "unitNumber", label: "Unit no.", required: true },
      { key: "tenantEmail", label: "Tenant email" },
      { key: "tenantName", label: "Tenant name", required: true },
      { key: "leaseStartDate", label: "Start date", required: true },
      { key: "leaseEndDate", label: "End date", required: true },
      { key: "monthlyRentAmount", label: "Rent", required: true },
      { key: "depositAmount", label: "Deposit" },
      { key: "status", label: "Status" },
    ],
    label: "Leases",
    nextDependency: "Needs matching properties, units, and tenant people.",
    template: [
      [
        "Property Code",
        "Unit no.",
        "Tenant Email",
        "Tenant Name",
        "Start Date",
        "End Date",
        "Monthly Rent",
        "Deposit",
        "Status",
      ],
      [
        "CTR",
        "12A",
        "tenant@example.com",
        "Sok Dara",
        "2026-01-01",
        "2026-12-31",
        "850",
        "850",
        "Active",
      ],
    ],
  },
  people: {
    description:
      "Bring in tenants, owners, vendors, and staff before linking leases.",
    fields: [
      { key: "displayName", label: "Display name", required: true },
      { key: "roles", label: "Roles", required: true },
      { key: "partyType", label: "Party type" },
      { key: "primaryEmail", label: "Email" },
      { key: "primaryPhone", label: "Phone" },
      { key: "legalName", label: "Legal name" },
      { key: "taxIdentifier", label: "Tax ID" },
      { key: "notes", label: "Notes" },
    ],
    label: "People",
    template: [
      [
        "Display Name",
        "Roles",
        "Party Type",
        "Email",
        "Phone",
        "Legal Name",
        "Tax ID",
        "Notes",
      ],
      [
        "Sok Dara",
        "tenant",
        "Individual",
        "tenant@example.com",
        "+855 12 345 678",
        "",
        "",
        "",
      ],
    ],
  },
  properties: {
    description:
      "Create or update property shells that units, people, leases, and ledger rows depend on.",
    fields: [
      { key: "code", label: "Code", required: true },
      { key: "name", label: "Name", required: true },
      { key: "propertyType", label: "Type" },
      { key: "address", label: "Address" },
      { key: "owner", label: "Owner label" },
      { key: "status", label: "Status" },
      { key: "acquisitionDate", label: "Acquisition date" },
      { key: "notes", label: "Notes" },
    ],
    label: "Properties",
    template: [
      [
        "Property Code",
        "Property Name",
        "Property Type",
        "Address",
        "Owner",
        "Status",
        "Acquisition Date",
        "Notes",
      ],
      [
        "CTR",
        "Central Residence",
        "Apartment",
        "Street 123, Phnom Penh",
        "Owner Co.",
        "Active",
        "2025-01-01",
        "",
      ],
    ],
  },
  units: {
    description:
      "Import unit rent roll data after property codes exist.",
    fields: unitImportFields,
    label: "Units / rent roll",
    nextDependency: "Needs properties first.",
    template: [
      [
        "Property Code",
        "Unit no. / Floor",
        "Type",
        "Inclusion",
        "Price",
        "Status",
        "Remark",
      ],
      ["CTR", "12A / 12", "Studio", "Furnished", "850", "Vacant", ""],
    ],
  },
};

const fieldCandidates: Record<ImportType, Record<string, string[]>> = {
  leases: {
    depositAmount: ["deposit", "securitydeposit"],
    leaseEndDate: ["enddate", "leaseend", "leaseenddate", "to"],
    leaseStartDate: ["startdate", "leasestart", "leasestartdate", "from"],
    monthlyRentAmount: ["rent", "monthlyrent", "price", "amount"],
    property: ["property", "propertycode", "propertyname", "building"],
    status: ["status", "leasestatus"],
    tenantEmail: ["tenantemail", "email"],
    tenantName: ["tenant", "tenantname", "name"],
    unitNumber: ["unit", "unitno", "unitnumber", "room"],
  },
  people: {
    displayName: ["displayname", "name", "person", "tenantname", "vendorname"],
    legalName: ["legalname", "registeredname"],
    notes: ["notes", "note", "remark", "remarks"],
    partyType: ["partytype", "type", "persontype"],
    primaryEmail: ["email", "primaryemail"],
    primaryPhone: ["phone", "primaryphone", "mobile"],
    roles: ["roles", "role"],
    taxIdentifier: ["taxid", "taxidentifier", "vat", "tin"],
  },
  properties: {
    acquisitionDate: ["acquisitiondate", "purchasedate", "startdate"],
    address: ["address", "location"],
    code: ["propertycode", "code", "buildingcode"],
    name: ["propertyname", "name", "building"],
    notes: ["notes", "note", "remark", "remarks"],
    owner: ["owner", "ownerlabel"],
    propertyType: ["propertytype", "type"],
    status: ["status"],
  },
  units: {
    floor: ["floor", "level", "storey"],
    inclusion: ["inclusion", "included", "furnished", "furniture", "includes"],
    property: [
      "property",
      "propertyname",
      "propertycode",
      "building",
      "buildingname",
      "buildingcode",
    ],
    remark: ["remark", "remarks", "note", "notes", "comment", "comments"],
    rentAmount: ["price", "rent", "currentrent", "monthlyrent", "amount"],
    sizeSqm: ["size", "sizesqm", "sqm", "area", "areasqm"],
    status: ["status", "availability", "occupancy", "state"],
    type: ["type", "unittype", "roomtype"],
    unitNumber: [
      "unit",
      "unitno",
      "unitnumber",
      "unitnofloor",
      "room",
      "roomnumber",
    ],
  },
};

export function getImportTypeConfig(type: ImportType) {
  return importTypeConfigs[type];
}

export function autoMapImportHeaders(
  type: ImportType,
  headers: string[],
): ImportMapping {
  const mapping: ImportMapping = {};
  const usedHeaders = new Set<string>();

  for (const field of importTypeConfigs[type].fields) {
    const candidates = fieldCandidates[type][field.key] ?? [];
    const match = headers.find((header) => {
      if (usedHeaders.has(header)) {
        return false;
      }

      const normalizedHeader = normalizeKey(header);
      return candidates.some(
        (candidate) =>
          normalizedHeader === candidate ||
          normalizedHeader.includes(candidate),
      );
    });

    if (match) {
      mapping[field.key] = match;
      usedHeaders.add(match);
    }
  }

  return mapping;
}

export function buildImportTemplateCsv(
  type: ImportType,
  referenceData?: ImportReferenceData,
) {
  return buildImportTemplateRows(type, referenceData)
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

function buildImportTemplateRows(
  type: ImportType,
  referenceData?: ImportReferenceData,
) {
  if (!referenceData) {
    return importTypeConfigs[type].template;
  }

  if (type === "properties" && referenceData.properties.length > 0) {
    return [
      importTypeConfigs.properties.template[0],
      ...referenceData.properties
        .slice(0, templateReferenceRowLimit)
        .map((property) => [
          property.code,
          property.name,
          "",
          "",
          "",
          "Active",
          "",
          "",
        ]),
    ];
  }

  if (type === "units" && referenceData.properties.length > 0) {
    const propertyById = new Map(
      referenceData.properties.map((property) => [property.id, property]),
    );
    const unitRows = referenceData.units
      .slice(0, templateReferenceRowLimit)
      .map((unit) => {
        const property = propertyById.get(unit.propertyId);

        return [
          unit.propertyCode,
          property?.name ?? "",
          unit.unitNumber,
          "",
          "",
          "",
          "",
          "",
        ];
      });

    return [
      [
        "Property Code",
        "Property Name",
        "Unit no. / Floor",
        "Type",
        "Inclusion",
        "Price",
        "Status",
        "Remark",
      ],
      ...(unitRows.length > 0
        ? unitRows
        : referenceData.properties
            .slice(0, templateReferenceRowLimit)
            .map((property) => [
              property.code,
              property.name,
              "",
              "",
              "",
              "",
              "Vacant",
              "",
            ])),
    ];
  }

  if (type === "people" && referenceData.people.length > 0) {
    return [
      importTypeConfigs.people.template[0],
      ...referenceData.people
        .slice(0, templateReferenceRowLimit)
        .map((person) => [
          person.displayName,
          person.roles.join("; "),
          "",
          person.primaryEmail ?? "",
          "",
          "",
          "",
          "",
        ]),
    ];
  }

  if (type === "leases" && referenceData.units.length > 0) {
    return [
      importTypeConfigs.leases.template[0],
      ...referenceData.units
        .slice(0, templateReferenceRowLimit)
        .map((unit) => [
          unit.propertyCode,
          unit.unitNumber,
          "",
          "",
          "",
          "",
          "",
          "",
          "Active",
        ]),
    ];
  }

  return importTypeConfigs[type].template;
}

export function buildGenericImportPreviewRows({
  mapping,
  records,
  referenceData,
  type,
}: {
  mapping: ImportMapping;
  records: Array<{ raw: Record<string, string>; rowNumber: number }>;
  referenceData: ImportReferenceData;
  type: ImportType;
}): GenericImportPreviewRow[] {
  if (type === "units") {
    return buildUnitImportPreviewRows({
      mapping: mapping as UnitImportMapping,
      properties: referenceData.properties,
      records,
    }).map((row) => ({
      actionLabel: row.actionLabel,
      amountLabel:
        row.currentRentAmount === null ? "Not set" : `USD ${row.currentRentAmount}`,
      issues: row.issues,
      normalizedData: toCommitRows([row])[0] ?? {},
      primaryLabel: row.unitNumber || "Not mapped",
      raw: row.raw,
      secondaryLabel: row.floor ? `Floor ${row.floor}` : "",
      sourceRowNumber: row.sourceRowNumber,
      statusLabel: row.status,
      targetLabel: row.propertyLabel || "Not mapped",
    }));
  }

  return flagDuplicateGenericRows(
    type,
    records.map((record) =>
      buildNonUnitPreviewRow({ mapping, record, referenceData, type }),
    ),
  );
}

export function getGenericImportStats(rows: GenericImportPreviewRow[]) {
  const errorCount = rows.filter((row) =>
    row.issues.some((issue) => issue.level === "error"),
  ).length;
  const warningCount = rows.filter((row) =>
    row.issues.some((issue) => issue.level === "warning"),
  ).length;

  return {
    errorCount,
    readyCount: rows.length - errorCount,
    totalCount: rows.length,
    warningCount,
  };
}

export function getGenericImportCleanupItems(
  type: ImportType,
  rows: GenericImportPreviewRow[],
): UnitImportCleanupItem[] {
  if (type === "units") {
    return getUnitImportCleanupItems(
      rows.map((row) => ({
        actionLabel:
          row.actionLabel === "Needs review" ? "Needs review" : "Create or update",
        currentRentAmount: null,
        floor: row.secondaryLabel.replace(/^Floor /, ""),
        inclusionLabel: "",
        issues: row.issues,
        mappedFields: {
          currentRentAmount: false,
          floor: false,
          sizeSqm: false,
          status: false,
        },
        propertyId: "",
        propertyLabel: row.targetLabel,
        raw: row.raw,
        remark: "",
        sizeSqm: null,
        sourceRowNumber: row.sourceRowNumber,
        status: "vacant",
        typeLabel: "",
        unitNumber: row.primaryLabel,
      })),
    );
  }

  return rows.flatMap((row) =>
    row.issues.map((issue) => ({
      actionHref: issue.actionHref,
      actionLabel: issue.actionLabel,
      level: issue.level,
      message: issue.message,
      propertyLabel: row.targetLabel || importTypeConfigs[type].label,
      sourceRowNumber: row.sourceRowNumber,
      unitNumber: row.primaryLabel || "Not mapped",
    })),
  );
}

function buildNonUnitPreviewRow({
  mapping,
  record,
  referenceData,
  type,
}: {
  mapping: ImportMapping;
  record: { raw: Record<string, string>; rowNumber: number };
  referenceData: ImportReferenceData;
  type: Exclude<ImportType, "units">;
}): GenericImportPreviewRow {
  if (type === "properties") {
    return buildPropertyPreviewRow({ mapping, record, referenceData });
  }

  if (type === "people") {
    return buildPeoplePreviewRow({ mapping, record, referenceData });
  }

  return buildLeasePreviewRow({ mapping, record, referenceData });
}

function flagDuplicateGenericRows(
  type: Exclude<ImportType, "units">,
  rows: GenericImportPreviewRow[],
) {
  const rowsByKey = new Map<string, GenericImportPreviewRow[]>();

  for (const row of rows) {
    const key = duplicateKeyForRow(type, row);

    if (!key) {
      continue;
    }

    const group = rowsByKey.get(key);

    if (group) {
      group.push(row);
    } else {
      rowsByKey.set(key, [row]);
    }
  }

  for (const group of rowsByKey.values()) {
    if (group.length < 2) {
      continue;
    }

    const rowNumbers = group.map((row) => row.sourceRowNumber).join(", ");

    for (const row of group) {
      row.actionLabel = "Needs review";
      row.issues.push({
        level: "error",
        message: `Duplicate ${importTypeConfigs[type].label.toLowerCase()} import rows: rows ${rowNumbers}. Keep one row before committing.`,
      });
    }
  }

  return rows;
}

function duplicateKeyForRow(
  type: Exclude<ImportType, "units">,
  row: GenericImportPreviewRow,
) {
  if (row.issues.some((issue) => issue.level === "error")) {
    return "";
  }

  if (type === "properties") {
    return normalizeLookup(String(row.normalizedData.code ?? ""));
  }

  if (type === "people") {
    const email = normalizeLookup(String(row.normalizedData.primaryEmail ?? ""));

    return email || normalizeLookup(String(row.normalizedData.displayName ?? ""));
  }

  return [
    row.normalizedData.propertyId,
    row.normalizedData.unitId,
    row.normalizedData.tenantPersonId,
    row.normalizedData.leaseStartDate,
  ]
    .map((value) => normalizeLookup(String(value ?? "")))
    .join(":");
}

function buildPropertyPreviewRow({
  mapping,
  record,
  referenceData,
}: {
  mapping: ImportMapping;
  record: { raw: Record<string, string>; rowNumber: number };
  referenceData: ImportReferenceData;
}): GenericImportPreviewRow {
  const issues: UnitImportIssue[] = [];
  const code = readMappedValue(record.raw, mapping.code).toUpperCase();
  const name = readMappedValue(record.raw, mapping.name);
  const existing = referenceData.properties.find(
    (property) => normalizeLookup(property.code) === normalizeLookup(code),
  );
  const propertyType =
    readMappedValue(record.raw, mapping.propertyType) || "Apartment";
  const status = normalizePropertyStatus(readMappedValue(record.raw, mapping.status));
  const acquisitionDate = readMappedValue(record.raw, mapping.acquisitionDate);

  requireValue(issues, mapping.code, code, "Code");
  requireValue(issues, mapping.name, name, "Name");

  if (code.length > 24) {
    issues.push({ level: "error", message: "Property code must be 24 characters or less." });
  }

  if (name.length > 120) {
    issues.push({ level: "error", message: "Property name must be 120 characters or less." });
  }

  if (!status) {
    issues.push({ level: "error", message: "Status must be active, under renovation, or inactive." });
  }

  if (acquisitionDate && !isIsoDate(acquisitionDate)) {
    issues.push({ level: "error", message: "Acquisition date must use YYYY-MM-DD." });
  }

  return {
    actionLabel: issues.some((issue) => issue.level === "error")
      ? "Needs review"
      : existing
        ? "Update"
        : "Create",
    amountLabel: "",
    issues,
    normalizedData: {
      acquisitionDate: acquisitionDate || null,
      address: readMappedValue(record.raw, mapping.address) || null,
      code,
      existingPropertyId: existing?.id ?? null,
      name,
      notes: readMappedValue(record.raw, mapping.notes) || null,
      owner: readMappedValue(record.raw, mapping.owner) || null,
      propertyType,
      status: status ?? "active",
    },
    primaryLabel: code || "Not mapped",
    raw: record.raw,
    secondaryLabel: name,
    sourceRowNumber: record.rowNumber,
    statusLabel: existing ? "Update" : "Create",
    targetLabel: existing?.label ?? "New property",
  };
}

function buildPeoplePreviewRow({
  mapping,
  record,
  referenceData,
}: {
  mapping: ImportMapping;
  record: { raw: Record<string, string>; rowNumber: number };
  referenceData: ImportReferenceData;
}): GenericImportPreviewRow {
  const issues: UnitImportIssue[] = [];
  const displayName = readMappedValue(record.raw, mapping.displayName);
  const roles = parseRoles(readMappedValue(record.raw, mapping.roles));
  const primaryEmail = readMappedValue(record.raw, mapping.primaryEmail);
  const partyType =
    normalizePartyType(readMappedValue(record.raw, mapping.partyType)) ??
    "individual";
  const existing = findPerson(referenceData, primaryEmail, displayName);

  requireValue(issues, mapping.displayName, displayName, "Display name");
  requireValue(issues, mapping.roles, roles.join(","), "Roles");

  if (primaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail)) {
    issues.push({ level: "error", message: "Email is not valid." });
  }

  if (roles.length === 0) {
    issues.push({
      level: "error",
      message: "Roles must include tenant, owner, vendor, or staff.",
    });
  }

  return {
    actionLabel: issues.some((issue) => issue.level === "error")
      ? "Needs review"
      : existing
        ? "Update"
        : "Create",
    amountLabel: "",
    issues,
    normalizedData: {
      displayName,
      existingPersonId: existing?.id ?? null,
      legalName: readMappedValue(record.raw, mapping.legalName) || null,
      notes: readMappedValue(record.raw, mapping.notes) || null,
      partyType,
      primaryEmail: primaryEmail || null,
      primaryPhone: readMappedValue(record.raw, mapping.primaryPhone) || null,
      roles,
      taxIdentifier: readMappedValue(record.raw, mapping.taxIdentifier) || null,
    },
    primaryLabel: displayName || "Not mapped",
    raw: record.raw,
    secondaryLabel: roles.join(", "),
    sourceRowNumber: record.rowNumber,
    statusLabel: existing ? "Update" : "Create",
    targetLabel: existing?.label ?? "New person",
  };
}

function buildLeasePreviewRow({
  mapping,
  record,
  referenceData,
}: {
  mapping: ImportMapping;
  record: { raw: Record<string, string>; rowNumber: number };
  referenceData: ImportReferenceData;
}): GenericImportPreviewRow {
  const issues: UnitImportIssue[] = [];
  const propertyInput = readMappedValue(record.raw, mapping.property);
  const property = findProperty(referenceData, propertyInput);
  const unitNumber = readMappedValue(record.raw, mapping.unitNumber);
  const unit = property
    ? referenceData.units.find(
        (item) =>
          item.propertyId === property.id &&
          normalizeLookup(item.unitNumber) === normalizeLookup(unitNumber),
      )
    : undefined;
  const tenantEmail = readMappedValue(record.raw, mapping.tenantEmail);
  const tenantName = readMappedValue(record.raw, mapping.tenantName);
  const tenant = findPerson(referenceData, tenantEmail, tenantName);
  const leaseStartDate = readMappedValue(record.raw, mapping.leaseStartDate);
  const leaseEndDate = readMappedValue(record.raw, mapping.leaseEndDate);
  const rent = parseMoney(readMappedValue(record.raw, mapping.monthlyRentAmount));
  const deposit = parseOptionalMoney(readMappedValue(record.raw, mapping.depositAmount));
  const status = normalizeLeaseStatus(readMappedValue(record.raw, mapping.status));

  requireValue(issues, mapping.property, propertyInput, "Property");
  requireValue(issues, mapping.unitNumber, unitNumber, "Unit no.");
  requireValue(issues, mapping.tenantName, tenantName || tenantEmail, "Tenant");
  requireValue(issues, mapping.leaseStartDate, leaseStartDate, "Start date");
  requireValue(issues, mapping.leaseEndDate, leaseEndDate, "End date");
  requireValue(issues, mapping.monthlyRentAmount, String(rent.amount ?? ""), "Rent");

  if (propertyInput && !property) {
    issues.push({
      actionHref: "/properties?action=create",
      actionLabel: "Add property",
      level: "error",
      message: `Property "${propertyInput}" was not found.`,
    });
  }

  if (property && unitNumber && !unit) {
    issues.push({
      actionHref: `/units?action=create&propertyId=${property.id}`,
      actionLabel: "Add unit",
      level: "error",
      message: `Unit "${unitNumber}" was not found under ${property.label}.`,
    });
  }

  if ((tenantName || tenantEmail) && !tenant) {
    issues.push({
      actionHref: "/people?action=create",
      actionLabel: "Add person",
      level: "error",
      message: "Tenant must already exist in People before importing leases.",
    });
  }

  if (!isIsoDate(leaseStartDate)) {
    issues.push({ level: "error", message: "Start date must use YYYY-MM-DD." });
  }

  if (!isIsoDate(leaseEndDate)) {
    issues.push({ level: "error", message: "End date must use YYYY-MM-DD." });
  }

  if (leaseStartDate && leaseEndDate && leaseEndDate < leaseStartDate) {
    issues.push({ level: "error", message: "End date must be on or after start date." });
  }

  if (rent.error) {
    issues.push({ level: "error", message: rent.error });
  }

  if (deposit.error) {
    issues.push({ level: "error", message: deposit.error });
  }

  if (!status) {
    issues.push({ level: "error", message: "Status must be active, draft, ended, notice given, cancelled, or terminated." });
  }

  return {
    actionLabel: issues.some((issue) => issue.level === "error")
      ? "Needs review"
      : "Create",
    amountLabel: rent.amount === null ? "Not set" : `USD ${rent.amount}`,
    issues,
    normalizedData: {
      depositAmount: deposit.amount,
      leaseEndDate,
      leaseStartDate,
      monthlyRentAmount: rent.amount,
      propertyId: property?.id ?? null,
      status: status ?? "active",
      tenantPersonId: tenant?.id ?? null,
      unitId: unit?.id ?? null,
    },
    primaryLabel: unitNumber || "Not mapped",
    raw: record.raw,
    secondaryLabel: tenant?.label ?? tenantName,
    sourceRowNumber: record.rowNumber,
    statusLabel: status ?? "Unknown",
    targetLabel: property?.label ?? propertyInput,
  };
}

function findProperty(referenceData: ImportReferenceData, value: string) {
  const normalized = normalizeLookup(value);

  return referenceData.properties.find((property) =>
    [
      property.id,
      property.code,
      property.name,
      property.label,
      `${property.code} - ${property.name}`,
    ].some((candidate) => normalizeLookup(candidate) === normalized),
  );
}

function findPerson(
  referenceData: ImportReferenceData,
  email: string,
  displayName: string,
) {
  const normalizedEmail = normalizeLookup(email);
  const normalizedName = normalizeLookup(displayName);

  if (normalizedEmail) {
    const emailMatch = referenceData.people.find(
      (person) => normalizeLookup(person.primaryEmail ?? "") === normalizedEmail,
    );

    if (emailMatch) {
      return emailMatch;
    }
  }

  return referenceData.people.find(
    (person) => normalizeLookup(person.displayName) === normalizedName,
  );
}

function requireValue(
  issues: UnitImportIssue[],
  header: string | undefined,
  value: string,
  label: string,
) {
  if (!header) {
    issues.push({
      level: "error",
      message: `Match ${label} to a spreadsheet column.`,
    });
    return;
  }

  if (!value.trim()) {
    issues.push({ level: "error", message: `${label} is required.` });
  }
}

function readMappedValue(raw: Record<string, string>, header?: string) {
  return header ? (raw[header]?.trim() ?? "") : "";
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase();
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizePropertyStatus(value: string) {
  const normalized = normalizeKey(value);

  if (!normalized) {
    return "active";
  }

  if (normalized === "underrenovation" || normalized === "renovation") {
    return "under_renovation";
  }

  if (normalized === "active" || normalized === "inactive") {
    return normalized;
  }

  return null;
}

function normalizePartyType(value: string) {
  const normalized = normalizeKey(value);

  if (!normalized || normalized === "individual" || normalized === "person") {
    return "individual";
  }

  if (normalized === "company" || normalized === "business") {
    return "company";
  }

  return null;
}

function normalizeLeaseStatus(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (!normalized) {
    return "active";
  }

  if (
    ["active", "cancelled", "draft", "ended", "notice_given", "terminated"].includes(
      normalized,
    )
  ) {
    return normalized;
  }

  return null;
}

function parseRoles(value: string) {
  return value
    .split(/[;,|]/)
    .map((role) => role.trim().toLowerCase())
    .map((role) => (role === "tenant" || role === "owner" || role === "vendor" || role === "staff" ? role : ""))
    .filter(Boolean);
}

type ParsedMoney = {
  amount: number | null;
  error?: string;
};

function parseMoney(value: string): ParsedMoney {
  const amountText = value.trim();

  if (!amountText) {
    return {
      amount: null,
      error: "Rent is required.",
    };
  }

  const amount = Number(
    amountText.replace(/\bUSD\b/gi, "").replace(/[$,]/g, "").trim(),
  );

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      amount: null,
      error: "Amount must be a non-negative USD number.",
    };
  }

  return { amount };
}

function parseOptionalMoney(value: string): ParsedMoney {
  if (!value.trim()) {
    return { amount: null };
  }

  return parseMoney(value);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeCsvCell(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
