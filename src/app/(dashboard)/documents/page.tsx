import { PageHeader } from "@/components/layout/page-header";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        description="Document metadata will live in Postgres, while files live in Supabase Storage."
        title="Documents"
      />
      <div className="px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="rounded-md border border-border bg-surface p-4 text-sm text-muted lg:max-w-3xl">
          Document upload starts once Supabase storage policies are ready.
        </div>
      </div>
    </div>
  );
}
