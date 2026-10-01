import { Suspense } from "react";
import * as Sentry from "@sentry/nextjs";
import { unstable_rethrow } from "next/navigation";
import { PeopleScreen } from "@/features/people/components/people-screen";
import { PeopleScreenSkeleton } from "@/features/people/components/people-screen-skeleton";
import { PeopleCommandCenter } from "@/features/people/components/people-command-center";
import { getAccessByPersonId } from "@/features/organization/data";
import { getPeopleInsightsData } from "@/features/people/data/people-insights";
import { getPeopleScreenData } from "@/features/people/data/people";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import type { PersonRoleValue } from "@/features/people/people.types";
import { requirePermission } from "@/lib/auth/context";

type PeopleModulePageProps = {
  config: PeopleModuleConfig;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type PeopleModuleConfig = {
  addButtonLabel: string;
  createRole?: PersonRoleValue;
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
    <Suspense fallback={<PeopleScreenSkeleton title={config.title} />}>
      <PeopleModulePageContent config={config} searchParams={searchParams} />
    </Suspense>
  );
}

export async function PeopleModulePageContent({
  config,
  searchParams,
}: PeopleModulePageProps) {
  const context = await requirePermission("people.view");
  const params = await searchParams;
  const viewQuery = parsePeopleSearchParams(
    config.role ? { ...params, role: config.role } : params,
  );
  const { pagination, people } = await getPeopleScreenData(
    context.organizationId,
    viewQuery,
  );
  const initialPersonId = viewQuery.personId ?? undefined;
  const activeStaffIds = people.flatMap((person) =>
    !person.isArchived &&
    person.roles.some(
      (role) => role.role === "staff" && role.status === "active",
    )
      ? [person.id]
      : [],
  );
  const accessByPersonId = context.isSuperAdmin && config.showAccessStatus
    ? await getAccessByPersonId(context.organizationId, activeStaffIds)
    : undefined;

  return (
    <PeopleScreen
      accessByPersonId={accessByPersonId}
      addButtonLabel={config.addButtonLabel}
      canCreate={
        context.permissionKeys.has("people.write") &&
        (context.isSuperAdmin || Boolean(config.createRole))
      }
      createRole={config.createRole}
      initialPersonId={initialPersonId}
      insightsAction={
        config.showInsights ? (
          <Suspense fallback={<PeopleInsightsActionFallback />}>
            <PeopleInsightsAction organizationId={context.organizationId} />
          </Suspense>
        ) : undefined
      }
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

export async function PeopleInsightsAction({
  organizationId,
}: {
  organizationId: string;
}) {
  let insights: Awaited<ReturnType<typeof getPeopleInsightsData>>;
  try {
    insights = await getPeopleInsightsData(organizationId);
  } catch (error) {
    unstable_rethrow(error);
    Sentry.captureException(error, {
      tags: { route: "/people", handled: "true" },
    });
    return null;
  }

  return <PeopleCommandCenter insights={insights} />;
}

function PeopleInsightsActionFallback() {
  return (
    <span
      aria-label="Loading people insights"
      className="h-8 w-24 animate-pulse rounded-md bg-muted"
      role="status"
    />
  );
}
