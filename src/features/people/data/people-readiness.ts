import { getAccessByPersonId } from "@/features/organization/data";
import { getPeopleScreenData } from "@/features/people/data/people";
import {
  buildPeopleTrustedReport,
  type PeopleReportKind,
} from "@/features/people/people.insights";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import type {
  PeopleArchiveState,
  PeopleRoleFilter,
  PeopleSummary,
} from "@/features/people/people.types";
import type { PeopleReadinessView } from "@/features/reports/reports.types";

const REPORT_PAGE_SIZE = 100;

export async function getPeopleReadinessReport({
  archiveState,
  organizationId,
  view,
}: {
  archiveState: PeopleArchiveState;
  organizationId: string;
  view: PeopleReadinessView;
}) {
  const role = getRoleForView(view);
  const people = await loadAllPeople({
    archiveState,
    organizationId,
    role,
  });
  const staffIds = people
    .filter((person) =>
      person.roles.some(
        (personRole) =>
          personRole.role === "staff" && personRole.status === "active",
      ),
    )
    .map((person) => person.id);
  const accessByPersonId = await getAccessByPersonId(
    organizationId,
    staffIds,
  );

  return buildPeopleTrustedReport({
    accessByPersonId,
    kind: getReportKind(view),
    people,
    totalCount: people.length,
  });
}

async function loadAllPeople({
  archiveState,
  organizationId,
  role,
}: {
  archiveState: PeopleArchiveState;
  organizationId: string;
  role: PeopleRoleFilter;
}) {
  const people: PeopleSummary[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await getPeopleScreenData(
      organizationId,
      parsePeopleSearchParams({
        archiveState,
        page: String(page),
        pageSize: String(REPORT_PAGE_SIZE),
        role,
      }),
    );
    people.push(...data.people);
    totalPages = data.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return people;
}

function getRoleForView(view: PeopleReadinessView): PeopleRoleFilter {
  return view === "relationship" ? "all" : view;
}

function getReportKind(view: PeopleReadinessView): PeopleReportKind {
  if (view === "tenant") return "tenant-readiness";
  if (view === "owner") return "owner-readiness";
  if (view === "vendor") return "vendor-activity";
  if (view === "staff") return "staff-access";
  return "relationship-readiness";
}
