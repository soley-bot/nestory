import { PageHeader } from "@/components/layout/page-header";
import { PeopleCommandCenter } from "@/features/people/components/people-command-center";
import { getPeopleReportHubData } from "@/features/people/data/people-reports";
import { requireAdminContext } from "@/lib/auth/context";

export default async function PeoplePage() {
  const context = await requireAdminContext();
  const data = await getPeopleReportHubData(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Relationship readiness across tenants, owners, vendors, and staff."
        title="People"
      />
      <PeopleCommandCenter
        people={data.people}
        totalCount={data.pagination.totalCount}
      />
    </div>
  );
}
