import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import { buildTrustedReportPdf } from "@/features/reports/data/pdf";
import { getPeopleScreenData } from "@/features/people/data/people";
import {
  buildPeopleTrustedReport,
  getPeopleReportOption,
  parsePeopleReportKind,
  type PeopleReportKind,
} from "@/features/people/people.insights";
import { parsePeopleSearchParams } from "@/features/people/people.filters";

export async function getPeopleReportHubData(organizationId: string) {
  const data = await getPeopleScreenData(
    organizationId,
    parsePeopleSearchParams({ archiveState: "active", pageSize: "100" }),
  );

  return {
    ...data,
    reportLimit: data.people.length,
  };
}

export async function getPeopleReportCsv(
  organizationId: string,
  reportParam: string | null,
) {
  const report = await getPeopleReport({
    organizationId,
    reportParam,
  });

  return {
    body: buildTrustedReportCsv(report),
    filename: `${report.exportFilenameBase}-current.csv`,
  };
}

export async function getPeopleReportPdf({
  organizationId,
  organizationName,
  reportParam,
}: {
  organizationId: string;
  organizationName: string;
  reportParam: string | null;
}) {
  const report = await getPeopleReport({
    organizationId,
    reportParam,
  });

  return {
    body: buildTrustedReportPdf({ organizationName, report }),
    filename: `${report.exportFilenameBase}-current.pdf`,
  };
}

async function getPeopleReport({
  organizationId,
  reportParam,
}: {
  organizationId: string;
  reportParam: string | null;
}) {
  const kind = parsePeopleReportKind(reportParam);
  const role = getRoleForReport(kind);
  const option = getPeopleReportOption(kind);
  const data = await getPeopleScreenData(
    organizationId,
    parsePeopleSearchParams({
      archiveState: "active",
      pageSize: "100",
      role,
    }),
  );

  return buildPeopleTrustedReport({
    kind: option.kind,
    people: data.people,
    totalCount: data.pagination.totalCount,
  });
}

function getRoleForReport(kind: PeopleReportKind) {
  if (kind === "tenant-readiness") {
    return "tenant";
  }

  if (kind === "owner-readiness") {
    return "owner";
  }

  if (kind === "vendor-activity") {
    return "vendor";
  }

  if (kind === "staff-access") {
    return "staff";
  }

  return undefined;
}
