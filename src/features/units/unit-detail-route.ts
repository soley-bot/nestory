import { buildHref } from "@/lib/url/href";

export type UnitRecordSection =
  | "overview"
  | "lease"
  | "finance"
  | "maintenance"
  | "files";

const unitRecordSections = new Set<UnitRecordSection>([
  "overview",
  "lease",
  "finance",
  "maintenance",
  "files",
]);

const legacyUnitRecordSections: Record<string, UnitRecordSection> = {
  documents: "files",
  photos: "files",
  reports: "finance",
  timeline: "overview",
};

export function parseUnitDetailQuery(
  searchParams: Record<string, string | string[] | undefined>,
): {
  section: UnitRecordSection;
  sourceTaskId?: string;
} {
  const section = firstValue(searchParams.section);
  const sourceTaskId = firstValue(searchParams.sourceTaskId);

  return {
    section: isUnitRecordSection(section)
      ? section
      : section
        ? legacyUnitRecordSections[section] ?? "overview"
        : "overview",
    ...(sourceTaskId ? { sourceTaskId } : {}),
  };
}

export function buildUnitRecordHref({
  section,
  sourceTaskId,
  unitId,
}: {
  section: UnitRecordSection;
  sourceTaskId?: string;
  unitId: string;
}) {
  return buildHref(`/units/${unitId}`, {
    section,
    sourceTaskId,
  });
}

export function getUnitRecordReturnLink(sourceTaskId?: string) {
  if (sourceTaskId) {
    return {
      href: buildHref("/maintenance", {
        archiveState: "all",
        taskId: sourceTaskId,
      }),
      label: "Back to case",
    };
  }

  return {
    href: "/units",
    label: "Units",
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isUnitRecordSection(
  value: string | undefined,
): value is UnitRecordSection {
  return unitRecordSections.has(value as UnitRecordSection);
}
