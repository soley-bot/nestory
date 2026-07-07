import { DashboardPreviewPage } from "@/features/dashboard-placeholders/dashboard-preview-page";

type PropertyDashboardPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PropertyDashboardPage({
  searchParams,
}: PropertyDashboardPageProps) {
  return DashboardPreviewPage({
    dashboard: "property-dashboard",
    searchParams,
  });
}
