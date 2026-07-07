import { DashboardPreviewPage } from "@/features/dashboard-placeholders/dashboard-preview-page";

type FinanceDashboardPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function FinanceDashboardPage({
  searchParams,
}: FinanceDashboardPageProps) {
  return DashboardPreviewPage({
    dashboard: "finance-dashboard",
    searchParams,
  });
}
