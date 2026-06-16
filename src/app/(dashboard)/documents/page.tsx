import { PageHeader } from "@/components/layout/page-header";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        description="Document metadata will live in Postgres, while files live in Supabase Storage."
        title="Documents"
      />
      <div className="p-8">
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
          Document upload starts once Supabase storage policies are ready.
        </div>
      </div>
    </div>
  );
}
