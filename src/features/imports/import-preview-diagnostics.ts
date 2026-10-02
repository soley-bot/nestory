import type {
  UnitImportCleanupItem,
  UnitImportIssue,
} from "@/features/imports/import.types";

type ImportPreviewIssueRow = {
  readonly issues: readonly UnitImportIssue[];
};

type ImportPreviewCleanupRow = ImportPreviewIssueRow & {
  readonly propertyLabel: string;
  readonly sourceRowNumber: number;
  readonly unitNumber: string;
};

type ImportPreviewStats = {
  errorCount: number;
  readyCount: number;
  totalCount: number;
  warningCount: number;
};

export function getImportPreviewStats(
  rows: readonly ImportPreviewIssueRow[],
): ImportPreviewStats {
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

export function getImportPreviewCleanupItems(
  rows: readonly ImportPreviewCleanupRow[],
  fallbackPropertyLabel: string,
): UnitImportCleanupItem[] {
  return rows.flatMap((row) =>
    row.issues.map((issue) => ({
      actionHref: issue.actionHref,
      actionLabel: issue.actionLabel,
      level: issue.level,
      message: issue.message,
      propertyLabel: row.propertyLabel || fallbackPropertyLabel,
      sourceRowNumber: row.sourceRowNumber,
      unitNumber: row.unitNumber || "Not mapped",
    })),
  );
}
