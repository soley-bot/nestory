import { renderTimelineRoute } from "@/features/timeline/timeline-route";

type FinancialTimelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FinancialTimelinePage({
  searchParams,
}: FinancialTimelinePageProps) {
  return renderTimelineRoute({
    description:
      "Review cost-bearing and ledger-linked history across properties and units.",
    scope: "financial",
    searchParams,
    title: "Financial Timeline",
  });
}
