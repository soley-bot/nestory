import { buildHref } from "@/lib/url/href";

export type LeaseRecordSection = "overview" | "rent" | "occupancy" | "files";

const leaseRecordSections = new Set<LeaseRecordSection>([
  "overview",
  "rent",
  "occupancy",
  "files",
]);

export function parseLeaseDetailQuery(
  searchParams: Record<string, string | string[] | undefined>,
): { section: LeaseRecordSection } {
  const value = firstValue(searchParams.section);

  return {
    section: leaseRecordSections.has(value as LeaseRecordSection)
      ? (value as LeaseRecordSection)
      : "overview",
  };
}

export function buildLeaseRecordHref({
  leaseId,
  section,
}: {
  leaseId: string;
  section?: LeaseRecordSection;
}) {
  return buildHref(`/leases/${leaseId}`, { section });
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
