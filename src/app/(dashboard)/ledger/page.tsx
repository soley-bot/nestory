import { PageHeader } from "@/components/layout/page-header";

export default function LedgerPage() {
  return (
    <div>
      <PageHeader
        description="Simple income and expense records linked to properties, units, documents, and timeline events."
        title="Financial Ledger"
      />
      <div className="p-8">
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
          Ledger table starts after timeline and property foundations are stable.
        </div>
      </div>
    </div>
  );
}
