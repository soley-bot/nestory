import { PageHeader } from "@/components/layout/page-header";

type PlannedPageProps = {
  description: string;
  message: string;
  title: string;
};

export function PlannedPage({ description, message, title }: PlannedPageProps) {
  return (
    <div>
      <PageHeader description={description} title={title} />
      <div className="p-8">
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
          {message}
        </div>
      </div>
    </div>
  );
}
