export type ImportPropertyOption = {
  code: string;
  id: string;
  label: string;
  name: string;
};

export type ImportType = "properties" | "units" | "people" | "leases";

export type ImportMapping = Record<string, string | undefined>;

export type ImportPersonOption = {
  displayName: string;
  id: string;
  label: string;
  primaryEmail: string | null;
  roles: string[];
};

export type ImportUnitOption = {
  id: string;
  label: string;
  propertyCode: string;
  propertyId: string;
  unitNumber: string;
};

export type ImportLeaseOccupancyOption = {
  endDate: string | null;
  leaseId: string;
  startDate: string | null;
  status: "notice_given" | "occupied" | "reserved";
  unitId: string;
};

export type ImportReferenceData = {
  leaseOccupancies: ImportLeaseOccupancyOption[];
  people: ImportPersonOption[];
  properties: ImportPropertyOption[];
  units: ImportUnitOption[];
};

export type ImportFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
};

export type GenericImportPreviewRow = {
  actionLabel: "Create" | "Create or update" | "Needs review" | "Update";
  amountLabel: string;
  issues: UnitImportIssue[];
  normalizedData: Record<string, unknown>;
  primaryLabel: string;
  raw: Record<string, string>;
  secondaryLabel: string;
  sourceRowNumber: number;
  statusLabel: string;
  targetLabel: string;
};

export type ImportSavedMapping = {
  id: string;
  importType: ImportType;
  mapping: ImportMapping;
  name: string;
  updatedAt: string;
};

export type ImportRunSummary = {
  blockedRows: number;
  committedAt: string | null;
  createdAt: string;
  createdCount: number;
  failedCount: number;
  fileName: string;
  id: string;
  importType: ImportType;
  readyRows: number;
  skippedCount: number;
  status:
    | "staged"
    | "committing"
    | "committed"
    | "committed_with_errors"
    | "failed";
  totalRows: number;
  updatedCount: number;
  warningRows: number;
};

export type UnitImportStatus =
  "vacant" | "occupied" | "reserved" | "maintenance" | "inactive";

export type UnitImportCommitRow = {
  currentRentAmount: number | null;
  floor: string;
  mappedFields: UnitImportMappedFields;
  propertyId: string;
  sizeSqm: number | null;
  sourceRowNumber: number;
  status: UnitImportStatus;
  unitNumber: string;
};

export type UnitImportMappedFields = {
  currentRentAmount: boolean;
  floor: boolean;
  sizeSqm: boolean;
  status: boolean;
};

export type UnitImportIssue = {
  actionHref?: string;
  actionLabel?: string;
  level: "error" | "warning";
  message: string;
};

export type UnitImportCleanupItem = UnitImportIssue & {
  propertyLabel: string;
  sourceRowNumber: number;
  unitNumber: string;
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
