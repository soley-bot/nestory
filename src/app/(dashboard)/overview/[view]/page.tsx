import { notFound } from "next/navigation";
import {
  OverviewDetailPage,
  type OverviewDetailView,
} from "@/features/overview/components/overview-detail-page";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { parseOverviewSearchParams } from "@/features/overview/overview.filters";
import { requireAdminContext } from "@/lib/auth/context";

type OverviewDetailPageProps = {
  params: Promise<{ view: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewDetailRoute({
  params,
  searchParams,
}: OverviewDetailPageProps) {
  const { view } = await params;
  if (!isOverviewDetailView(view)) notFound();

  const context = await requireAdminContext();
  const query = parseOverviewSearchParams(await searchParams);
  const data = await getOverviewScreenData(context.organizationId, {
    ...query,
    propertyId: "all",
    review: "all",
  });

  return <OverviewDetailPage data={data} query={query} view={view} />;
}

function isOverviewDetailView(value: string): value is OverviewDetailView {
  return value === "attention" || value === "readiness";
}
