export type ImportPropertyOption = {
  code: string;
  id: string;
  label: string;
  name: string;
};

export type UnitImportStatus =
  | "vacant"
  | "occupied"
  | "reserved"
  | "maintenance"
  | "inactive";

export type UnitImportCommitRow = {
  currentRentAmount: number | null;
  floor: string;
  propertyId: string;
  sizeSqm: number | null;
  sourceRowNumber: number;
  status: UnitImportStatus;
  unitNumber: string;
};

export type UnitImportIssue = {
  level: "error" | "warning";
  message: string;
};

export type UnitImportPreviewRow = UnitImportCommitRow & {
  actionLabel: "Create or update" | "Needs review";
  inclusionLabel: string;
  issues: UnitImportIssue[];
  propertyLabel: string;
  raw: Record<string, string>;
  remark: string;
  typeLabel: string;
};

export type UnitImportField =
  | "property"
  | "unitNumber"
  | "floor"
  | "status"
  | "rentAmount"
  | "sizeSqm"
  | "type"
  | "inclusion"
  | "remark";

export type UnitImportMapping = Partial<Record<UnitImportField, string>>;

export type ParsedCsvRecord = {
  raw: Record<string, string>;
  rowNumber: number;
};

