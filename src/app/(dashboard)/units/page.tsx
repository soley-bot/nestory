import { PageHeader } from "@/components/layout/page-header";

export default function UnitsPage() {
  return (
    <div>
      <PageHeader
        description="Unit records will connect to properties, leases, ledger entries, documents, and timeline events."
        title="Units"
      />
      <div className="p-8">
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
          Unit table starts in the next implementation pass.
        </div>
      </div>
    </div>
  );
}
