import { PageHeader } from "@/components/layout/page-header";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        description="Reports will begin as on-screen summaries, then expand to PDF and spreadsheet exports."
        title="Reports"
      />
      <div className="p-8">
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
          Property summary reports are planned after core records exist.
        </div>
      </div>
    </div>
  );
}
