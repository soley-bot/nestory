import { redirect } from "next/navigation";

type PeopleReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const legacyViewByReport = {
  "owner-readiness": "owner",
  "relationship-readiness": "relationship",
  "staff-access": "staff",
  "tenant-readiness": "tenant",
  "vendor-activity": "vendor",
} as const;

export default async function PeopleReportsPage({
  searchParams,
}: PeopleReportsPageProps) {
  const rawParams = await searchParams;
  const report = getFirstValue(rawParams.report);
  const archiveState = getFirstValue(rawParams.archiveState);
  const params = new URLSearchParams();
  const view =
    report && report in legacyViewByReport
      ? legacyViewByReport[report as keyof typeof legacyViewByReport]
      : undefined;

  if (view && view !== "relationship") {
    params.set("peopleView", view);
  }
  if (archiveState === "archived" || archiveState === "all") {
    params.set("archiveState", archiveState);
  }

  const suffix = params.toString();
  redirect(
    suffix
      ? `/reports/people-readiness?${suffix}`
      : "/reports/people-readiness",
  );
}

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
