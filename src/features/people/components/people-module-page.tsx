import { Suspense } from "react";
import { PeopleScreen } from "@/features/people/components/people-screen";
import { PeopleScreenSkeleton } from "@/features/people/components/people-screen-skeleton";
import { getAccessByPersonId } from "@/features/organization/data";
import { getPeopleInsightsData } from "@/features/people/data/people-insights";
import { getPeopleScreenData } from "@/features/people/data/people";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import type { PersonRoleValue } from "@/features/people/people.types";
import { requireAdminContext } from "@/lib/auth/context";

type PeopleModulePageProps = {
  config: PeopleModuleConfig;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type PeopleModuleConfig = {
  addButtonLabel: string;
  createRole?: PersonRoleValue;
  description: string;
  role?: PersonRoleValue;
  searchPlaceholder: string;
  showAccessStatus?: boolean;
  showInsights?: boolean;
  title: string;
};

export function PeopleModulePage({
  config,
  searchParams,
}: PeopleModulePageProps) {
  return (
    <Suspense
      fallback={
        <PeopleScreenSkeleton
          description={config.description}
          title={config.title}
        />
      }
    >
      <PeopleModulePageContent config={config} searchParams={searchParams} />
    </Suspense>
  );
}

async function PeopleModulePageContent({
  config,
  searchParams,
}: PeopleModulePageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parsePeopleSearchParams(
    config.role ? { ...params, role: config.role } : params,
  );
  const [{ pagination, people }, insights] = await Promise.all([
    getPeopleScreenData(context.organizationId, viewQuery),
    config.showInsights
      ? getPeopleInsightsData(context.organizationId)
      : Promise.resolve(undefined),
  ]);
  const initialPersonId = viewQuery.personId ?? undefined;
  const accessByPersonId = config.showAccessStatus
    ? await getAccessByPersonId(
        context.organizationId,
        people.map((person) => person.id),
      )
    : undefined;

  return (
    <PeopleScreen
      accessByPersonId={accessByPersonId}
      addButtonLabel={config.addButtonLabel}
      createRole={config.createRole}
      description={config.description}
      initialPersonId={initialPersonId}
      insights={insights}
      key={initialPersonId ?? config.role ?? "people"}
      lockedRole={config.role}
      pagination={pagination}
      people={people}
      searchPlaceholder={config.searchPlaceholder}
      title={config.title}
      viewQuery={viewQuery}
    />
  );
}
