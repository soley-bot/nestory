import type {
  ImportPropertyOption,
  ParsedCsvRecord,
  UnitImportCleanupItem,
  UnitImportCommitRow,
  UnitImportField,
  UnitImportMapping,
  UnitImportPreviewRow,
  UnitImportStatus,
} from "@/features/imports/import.types";

const unitStatuses: UnitImportStatus[] = [
  "vacant",
  "occupied",
  "reserved",
  "maintenance",
  "inactive",
];

const requiredFields: UnitImportField[] = ["property", "unitNumber"];

const fieldCandidates: Record<UnitImportField, string[]> = {
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
};

export const unitImportFields: Array<{
  key: UnitImportField;
  label: string;
  required?: boolean;
}> = [
  { key: "property", label: "Property", required: true },
  { key: "unitNumber", label: "Unit no.", required: true },
  { key: "floor", label: "Floor" },
  { key: "status", label: "Status" },
  { key: "rentAmount", label: "Price" },
  { key: "sizeSqm", label: "Size" },
  { key: "type", label: "Type" },
  { key: "inclusion", label: "Inclusion" },
  { key: "remark", label: "Remark" },
];

export function parseCsv(text: string): {
  headers: string[];
  records: ParsedCsvRecord[];
} {
  const parsedRows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const headerRow = parsedRows[0] ?? [];
  const headers = makeUniqueHeaders(headerRow.map((header) => header.trim()));

  if (headers.length === 0) {
    return { headers: [], records: [] };
  }

  const records = parsedRows.slice(1).flatMap((row, index) => {
    const hasContent = row.some((value) => value.trim().length > 0);

    if (!hasContent) {
      return [];
    }

    const raw: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      raw[header] = row[headerIndex]?.trim() ?? "";
    });

    return [{ raw, rowNumber: index + 2 }];
  });

  return { headers, records };
}

export function autoMapUnitImportHeaders(headers: string[]): UnitImportMapping {
  const mapping: UnitImportMapping = {};
  const usedHeaders = new Set<string>();

  for (const field of unitImportFields) {
    const candidates = fieldCandidates[field.key];
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

export function buildUnitImportPreviewRows({
  mapping,
  properties,
  records,
}: {
  mapping: UnitImportMapping;
  properties: ImportPropertyOption[];
  records: ParsedCsvRecord[];
}): UnitImportPreviewRow[] {
  const propertyIndex = buildPropertyIndex(properties);

  return records.map((record) =>
    buildPreviewRow({
      mapping,
      propertyIndex,
      record,
    }),
  );
}

export function getUnitImportStats(rows: UnitImportPreviewRow[]) {
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

export function getUnitImportCleanupItems(
  rows: UnitImportPreviewRow[],
): UnitImportCleanupItem[] {
  return rows.flatMap((row) =>
    row.issues.map((issue) => ({
      level: issue.level,
      message: issue.message,
      propertyLabel: row.propertyLabel || "Not mapped",
      sourceRowNumber: row.sourceRowNumber,
      unitNumber: row.unitNumber || "Not mapped",
    })),
  );
}

export function toCommitRows(
  rows: UnitImportPreviewRow[],
): UnitImportCommitRow[] {
  return rows
    .filter((row) => !row.issues.some((issue) => issue.level === "error"))
    .map((row) => ({
      currentRentAmount: row.currentRentAmount,
      floor: row.floor,
      propertyId: row.propertyId,
      sizeSqm: row.sizeSqm,
      sourceRowNumber: row.sourceRowNumber,
      status: row.status,
      unitNumber: row.unitNumber,
    }));
}

export function buildUnitImportTemplateCsv() {
  return [
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
  ]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

function buildPreviewRow({
  mapping,
  propertyIndex,
  record,
}: {
  mapping: UnitImportMapping;
  propertyIndex: Map<string, ImportPropertyOption>;
  record: ParsedCsvRecord;
}): UnitImportPreviewRow {
  const issues: UnitImportPreviewRow["issues"] = [];
  const propertyInput = readMappedValue(record.raw, mapping.property);
  const property = propertyIndex.get(normalizeLookup(propertyInput));
  const unitAndFloor = splitUnitAndFloor(
    readMappedValue(record.raw, mapping.unitNumber),
  );
  const unitNumber = unitAndFloor.unitNumber;
  const floor =
    readMappedValue(record.raw, mapping.floor) || unitAndFloor.floor;
  const typeLabel = readMappedValue(record.raw, mapping.type) || "Not recorded";
  const inclusionLabel =
    readMappedValue(record.raw, mapping.inclusion) || "Not recorded";
  const remark = readMappedValue(record.raw, mapping.remark);
  const status = normalizeStatus(readMappedValue(record.raw, mapping.status));
  const money = parseMoney(readMappedValue(record.raw, mapping.rentAmount));
  const sizeSqm = parseOptionalNumber(
    readMappedValue(record.raw, mapping.sizeSqm),
  );

  for (const field of requiredFields) {
    if (!mapping[field]) {
      issues.push({
        level: "error",
        message: `${getFieldLabel(field)} column is not mapped.`,
      });
    }
  }

  if (!propertyInput) {
    issues.push({ level: "error", message: "Property is required." });
  } else if (!property) {
    issues.push({
      level: "error",
      message: `Property "${propertyInput}" does not match an active property.`,
    });
  }

  if (!unitNumber) {
    issues.push({ level: "error", message: "Unit number is required." });
  } else if (unitNumber.length > 40) {
    issues.push({
      level: "error",
      message: "Unit number must be 40 characters or less.",
    });
  }

  if (floor.length > 40) {
    issues.push({
      level: "error",
      message: "Floor must be 40 characters or less.",
    });
  }

  if (status === null) {
    issues.push({
      level: "error",
      message:
        "Status must be vacant, occupied, reserved, maintenance, or inactive.",
    });
  }

  if (money.error) {
    issues.push({ level: "error", message: money.error });
  }

  if (sizeSqm.error) {
    issues.push({ level: "error", message: sizeSqm.error });
  }

  if (mapping.type) {
    issues.push({
      level: "warning",
      message: "Type is preview-only until the unit schema stores it.",
    });
  }

  if (mapping.inclusion) {
    issues.push({
      level: "warning",
      message: "Inclusion is preview-only until the unit schema stores it.",
    });
  }

  return {
    actionLabel: issues.some((issue) => issue.level === "error")
      ? "Needs review"
      : "Create or update",
    currentRentAmount: money.amount,
    floor,
    inclusionLabel,
    issues,
    propertyId: property?.id ?? "",
    propertyLabel: property?.label ?? propertyInput,
    raw: record.raw,
    remark,
    sizeSqm: sizeSqm.value,
    sourceRowNumber: record.rowNumber,
    status: status ?? "vacant",
    typeLabel,
    unitNumber,
  };
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function makeUniqueHeaders(headers: string[]) {
  const counts = new Map<string, number>();

  return headers
    .filter((header) => header.length > 0)
    .map((header) => {
      const count = counts.get(header) ?? 0;
      counts.set(header, count + 1);

      return count === 0 ? header : `${header} ${count + 1}`;
    });
}

function readMappedValue(raw: Record<string, string>, header?: string) {
  return header ? (raw[header]?.trim() ?? "") : "";
}

function splitUnitAndFloor(value: string) {
  const [unitNumber = "", floor = ""] = value
    .split("/")
    .map((part) => part.trim());

  return { floor, unitNumber };
}

function normalizeStatus(value: string): UnitImportStatus | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) {
    return "vacant";
  }

  if (normalized === "available" || normalized === "ready") {
    return "vacant";
  }

  if (normalized === "rented" || normalized === "leased") {
    return "occupied";
  }

  if (normalized === "repair" || normalized === "renovation") {
    return "maintenance";
  }

  return unitStatuses.includes(normalized as UnitImportStatus)
    ? (normalized as UnitImportStatus)
    : null;
}

function parseMoney(amountValue: string) {
  const amountText = amountValue.trim();

  if (!amountText) {
    return {
      amount: null,
    };
  }

  const normalizedAmount = amountText
    .replace(/\bUSD\b/gi, "")
    .replace(/[$,]/g, "")
    .trim();

  if (/[A-Za-z]/.test(normalizedAmount)) {
    return {
      amount: null,
      error: "Price must be a USD amount.",
    };
  }

  const amount = Number(normalizedAmount.replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      amount: null,
      error: "Price must be a non-negative number.",
    };
  }

  return {
    amount,
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { value: null };
  }

  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      error: "Size must be a non-negative number.",
      value: null,
    };
  }

  return { value: parsed };
}

function buildPropertyIndex(properties: ImportPropertyOption[]) {
  const index = new Map<string, ImportPropertyOption>();

  for (const property of properties) {
    for (const value of [
      property.id,
      property.code,
      property.name,
      property.label,
      `${property.code} - ${property.name}`,
      `${property.code} / ${property.name}`,
    ]) {
      index.set(normalizeLookup(value), property);
    }
  }

  return index;
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

function getFieldLabel(field: UnitImportField) {
  return unitImportFields.find((item) => item.key === field)?.label ?? field;
}

function escapeCsvCell(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
