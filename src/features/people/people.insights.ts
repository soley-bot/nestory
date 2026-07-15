import type { TrustedReport } from "@/features/reports/reports.types";
import { slugifyReportPart } from "@/features/reports/data/report-format";
import type {
  PeopleBadgeTone,
  PeopleSummary,
  PersonRoleValue,
} from "@/features/people/people.types";

export type PeopleReportKind =
  | "relationship-readiness"
  | "tenant-readiness"
  | "owner-readiness"
  | "vendor-activity"
  | "staff-access";

export type PeopleInsightMetric = {
  helper: string;
  href: string;
  label: string;
  tone?: PeopleBadgeTone;
  value: string;
};

export type PeopleAttentionQueue = {
  count: number;
  description: string;
  href: string;
  id: string;
  label: string;
  tone: PeopleBadgeTone;
};

export type PeopleRelationshipStat = {
  count: number;
  helper: string;
  href: string;
  label: string;
  readyCount: number;
  tone?: PeopleBadgeTone;
};

export type PeopleInsights = {
  attentionQueues: PeopleAttentionQueue[];
  metrics: PeopleInsightMetric[];
  relationshipStats: PeopleRelationshipStat[];
  totalCount: number;
  visibleCount: number;
};

export type PeopleInsightCounts = {
  activeCount: number;
  missingContactCount: number;
  missingEvidenceCount: number;
  missingRoleCount: number;
  owners: PeopleReadinessCount;
  staff: PeopleReadinessCount;
  tenants: PeopleReadinessCount;
  totalCount: number;
  vendors: PeopleReadinessCount;
  visibleCount: number;
};

type PeopleReadinessCount = {
  count: number;
  readyCount: number;
};

export const peopleReportOptions: Array<{
  description: string;
  href: string;
  kind: PeopleReportKind;
  title: string;
}> = [
  {
    description:
      "Directory quality, role assignment, contact readiness, evidence, and next actions.",
    href: "/people?archiveState=all",
    kind: "relationship-readiness",
    title: "Relationship Readiness",
  },
  {
    description:
      "Tenants with contact, active lease links, evidence, and renewal follow-up context.",
    href: "/tenants",
    kind: "tenant-readiness",
    title: "Tenant Readiness",
  },
  {
    description:
      "Owners with property links, communication readiness, evidence, and report preparation cues.",
    href: "/owners",
    kind: "owner-readiness",
    title: "Owner Readiness",
  },
  {
    description:
      "Vendor profiles, preferred status, service coverage, evidence, and maintenance linkage cues.",
    href: "/vendors",
    kind: "vendor-activity",
    title: "Vendor Activity",
  },
  {
    description:
      "Staff directory readiness and access-management follow-up for operating teams.",
    href: "/staff",
    kind: "staff-access",
    title: "Staff Access",
  },
];

export function getPeopleInsights(
  people: PeopleSummary[],
  totalCount = people.length,
): PeopleInsights {
  const activePeople = people.filter((person) => !person.isArchived);
  const missingContact = activePeople.filter((person) => !person.hasUsefulContact);
  const missingRole = activePeople.filter((person) => !hasAnyActiveRole(person));
  const missingEvidence = activePeople.filter(
    (person) => person.recordCounts.documents === 0,
  );
  const tenants = activePeople.filter((person) => hasActiveRole(person, "tenant"));
  const owners = activePeople.filter((person) => hasActiveRole(person, "owner"));
  const vendors = activePeople.filter((person) => hasActiveRole(person, "vendor"));
  const staff = activePeople.filter((person) => hasActiveRole(person, "staff"));
  const tenantReady = tenants.filter(
    (person) => person.hasUsefulContact && person.linked.activeLeaseCount > 0,
  ).length;
  const ownerReady = owners.filter(
    (person) => person.hasUsefulContact && person.linked.ownerPropertyCount > 0,
  ).length;
  const vendorReady = vendors.filter(
    (person) => person.hasUsefulContact && person.linked.vendorProfile,
  ).length;
  const staffReady = staff.filter((person) => person.hasUsefulContact).length;

  return buildPeopleInsightsFromCounts({
    activeCount: activePeople.length,
    missingContactCount: missingContact.length,
    missingEvidenceCount: missingEvidence.length,
    missingRoleCount: missingRole.length,
    owners: { count: owners.length, readyCount: ownerReady },
    staff: { count: staff.length, readyCount: staffReady },
    tenants: { count: tenants.length, readyCount: tenantReady },
    totalCount,
    vendors: { count: vendors.length, readyCount: vendorReady },
    visibleCount: people.length,
  });
}

export function buildPeopleInsightsFromCounts({
  activeCount,
  missingContactCount,
  missingEvidenceCount,
  missingRoleCount,
  owners,
  staff,
  tenants,
  totalCount,
  vendors,
  visibleCount,
}: PeopleInsightCounts): PeopleInsights {
  return {
    attentionQueues: [
      {
        count: missingContactCount,
        description: "People records without a usable email or phone.",
        href: "/people-reports",
        id: "missing-contact",
        label: "Missing contact",
        tone: missingContactCount > 0 ? "warning" : "success",
      },
      {
        count: missingRoleCount,
        description: "Records that cannot drive workflows until a role is set.",
        href: "/people-reports",
        id: "missing-role",
        label: "No role",
        tone: missingRoleCount > 0 ? "warning" : "success",
      },
      {
        count: missingEvidenceCount,
        description: "Records without linked documents or evidence.",
        href: "/people-reports",
        id: "missing-evidence",
        label: "Evidence gaps",
        tone: missingEvidenceCount > 0 ? "warning" : "success",
      },
      {
        count: vendors.count - vendors.readyCount,
        description: "Vendor records missing contact or service profile context.",
        href: "/vendors",
        id: "vendor-review",
        label: "Vendor review",
        tone:
          vendors.count - vendors.readyCount > 0 ? "warning" : "success",
      },
    ],
    metrics: [
      {
        helper:
          activeCount === totalCount
            ? "Active directory records"
            : `${activeCount} visible active`,
        href: "/people",
        label: "People",
        tone: "accent",
        value: String(totalCount),
      },
      {
        helper: "Ready tenants with active lease context",
        href: "/tenants",
        label: "Tenants",
        tone: getReadinessTone(tenants.readyCount, tenants.count),
        value: formatRatio(tenants.readyCount, tenants.count),
      },
      {
        helper: "Owners with property links and contact",
        href: "/owners",
        label: "Owners",
        tone: getReadinessTone(owners.readyCount, owners.count),
        value: formatRatio(owners.readyCount, owners.count),
      },
      {
        helper: "Vendors with service profile and contact",
        href: "/vendors",
        label: "Vendors",
        tone: getReadinessTone(vendors.readyCount, vendors.count),
        value: formatRatio(vendors.readyCount, vendors.count),
      },
    ],
    relationshipStats: [
      {
        count: tenants.count,
        helper: "Contact plus active lease link",
        href: "/tenants",
        label: "Tenant readiness",
        readyCount: tenants.readyCount,
        tone: getReadinessTone(tenants.readyCount, tenants.count),
      },
      {
        count: owners.count,
        helper: "Contact plus ownership link",
        href: "/owners",
        label: "Owner readiness",
        readyCount: owners.readyCount,
        tone: getReadinessTone(owners.readyCount, owners.count),
      },
      {
        count: vendors.count,
        helper: "Contact plus vendor profile",
        href: "/vendors",
        label: "Vendor readiness",
        readyCount: vendors.readyCount,
        tone: getReadinessTone(vendors.readyCount, vendors.count),
      },
      {
        count: staff.count,
        helper: "Contact-ready staff records",
        href: "/staff",
        label: "Staff readiness",
        readyCount: staff.readyCount,
        tone: getReadinessTone(staff.readyCount, staff.count),
      },
    ],
    totalCount,
    visibleCount,
  };
}

export function buildPeopleTrustedReport({
  generatedAt = new Date().toISOString(),
  kind,
  people,
  totalCount = people.length,
}: {
  generatedAt?: string;
  kind: PeopleReportKind;
  people: PeopleSummary[];
  totalCount?: number;
}): TrustedReport {
  const option = getPeopleReportOption(kind);
  const reportPeople = getPeopleForReport(people, kind);
  const insights = getPeopleInsights(people, totalCount);

  return {
    columns: [
      { key: "roles", label: "Roles" },
      { key: "contact", label: "Contact" },
      { key: "linked", label: "Linked context" },
      { key: "evidence", label: "Evidence" },
      { key: "next", label: "Next action" },
    ],
    description: option.description,
    emptyDescription: "No people records match this report.",
    emptyTitle: "No people rows",
    exportFilenameBase: `people-${slugifyReportPart(option.title)}`,
    generatedAt,
    kind: "missing-data",
    periodLabel: "Current directory snapshot",
    rows: reportPeople.map((person) => ({
      cells: {
        contact: person.contact.label,
        evidence: `${person.recordCounts.documents} document${
          person.recordCounts.documents === 1 ? "" : "s"
        }`,
        linked: getLinkedLabel(person),
        next: person.nextAction.label,
        roles: person.roleLabel,
      },
      href: getPrimaryPersonHref(person),
      id: person.id,
      sourceCount: getPersonSourceCount(person),
      sourceLinks: [
        {
          href: getPrimaryPersonHref(person),
          id: person.id,
          label: person.displayName,
          recordType: "person",
        },
      ],
      sourceSummary: `${getPersonSourceCount(person)} linked source${
        getPersonSourceCount(person) === 1 ? "" : "s"
      }`,
      title: person.displayName,
      tone: getReportRowTone(person),
    })),
    scopeLabel: option.title,
    summary: [
      {
        detail: "People records included in this export window.",
        label: "Visible rows",
        sourceCount: people.length,
        value: `${people.length} of ${totalCount}`,
      },
      {
        detail: "Records without usable email or phone.",
        label: "Missing contact",
        sourceCount: insights.attentionQueues[0]?.count ?? 0,
        value: String(insights.attentionQueues[0]?.count ?? 0),
      },
      {
        detail: "Records without active tenant, owner, vendor, or staff role.",
        label: "No role",
        sourceCount: insights.attentionQueues[1]?.count ?? 0,
        value: String(insights.attentionQueues[1]?.count ?? 0),
      },
      {
        detail: "Records without linked evidence documents.",
        label: "Evidence gaps",
        sourceCount: insights.attentionQueues[2]?.count ?? 0,
        value: String(insights.attentionQueues[2]?.count ?? 0),
      },
    ],
    title: option.title,
    totalsTraceLabel: `People report traces to ${reportPeople.length} visible people rows.`,
    totalRowCount: reportPeople.length,
  };
}

export function getPeopleReportOption(kind: PeopleReportKind) {
  return (
    peopleReportOptions.find((option) => option.kind === kind) ??
    peopleReportOptions[0]
  );
}

export function parsePeopleReportKind(value: string | null): PeopleReportKind {
  return peopleReportOptions.some((option) => option.kind === value)
    ? (value as PeopleReportKind)
    : "relationship-readiness";
}

export function getPeopleReportExportHref(
  kind: PeopleReportKind,
  format: "csv" | "pdf",
) {
  const endpoint =
    format === "csv" ? "/api/people-reports/export" : "/api/people-reports/pdf";
  const params = new URLSearchParams({ report: kind });

  return `${endpoint}?${params.toString()}`;
}

function getPeopleForReport(people: PeopleSummary[], kind: PeopleReportKind) {
  if (kind === "tenant-readiness") {
    return people.filter((person) => hasActiveRole(person, "tenant"));
  }

  if (kind === "owner-readiness") {
    return people.filter((person) => hasActiveRole(person, "owner"));
  }

  if (kind === "vendor-activity") {
    return people.filter((person) => hasActiveRole(person, "vendor"));
  }

  if (kind === "staff-access") {
    return people.filter((person) => hasActiveRole(person, "staff"));
  }

  return people;
}

function hasAnyActiveRole(person: PeopleSummary) {
  return person.roles.some((role) => role.status === "active");
}

function hasActiveRole(person: PeopleSummary, role: PersonRoleValue) {
  return person.roles.some(
    (personRole) => personRole.role === role && personRole.status === "active",
  );
}

function formatRatio(readyCount: number, count: number) {
  return count === 0 ? "0" : `${readyCount}/${count}`;
}

function getReadinessTone(
  readyCount: number,
  count: number,
): PeopleBadgeTone | undefined {
  if (count === 0) {
    return "neutral";
  }

  const ratio = readyCount / count;

  if (ratio >= 0.85) {
    return "success";
  }

  if (ratio >= 0.55) {
    return "warning";
  }

  return "danger";
}

function getLinkedLabel(person: PeopleSummary) {
  if (person.linked.activeLeaseCount > 0) {
    return `${person.linked.activeLeaseCount} active lease${
      person.linked.activeLeaseCount === 1 ? "" : "s"
    }`;
  }

  if (person.linked.ownerPropertyCount > 0) {
    return `${person.linked.ownerPropertyCount} owner propert${
      person.linked.ownerPropertyCount === 1 ? "y" : "ies"
    }`;
  }

  if (person.linked.vendorProfile) {
    return person.linked.vendorProfile.label;
  }

  return "No linked context";
}

function getPersonSourceCount(person: PeopleSummary) {
  return Math.max(
    1,
    person.recordCounts.activity +
      person.recordCounts.documents +
      person.recordCounts.leases +
      person.recordCounts.properties +
      person.recordCounts.vendors,
  );
}

function getReportRowTone(person: PeopleSummary) {
  if (!person.hasUsefulContact || !hasAnyActiveRole(person)) {
    return "warning";
  }

  if (person.nextAction.tone === "warning" || person.nextAction.tone === "danger") {
    return "warning";
  }

  return "neutral";
}

function getPrimaryPersonHref(person: PeopleSummary) {
  return person.hrefs.people;
}
