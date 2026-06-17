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
      <div className="px-4 py-5 sm:px-6 lg:p-8">
        <div className="rounded-md border border-border bg-surface p-5 text-sm leading-6 text-muted shadow-[0_18px_60px_rgba(8,11,18,0.035)]">
          {message}
        </div>
      </div>
    </div>
  );
}
