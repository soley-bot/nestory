type ModuleLoadingProps = {
  kind?: "dashboard" | "list" | "report";
  title: string;
};

export function ModuleLoading({ kind = "list", title }: ModuleLoadingProps) {
  const isDashboard = kind === "dashboard";
  const isReport = kind === "report";

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-muted" />
        <div className="mt-3 h-6 w-52 animate-pulse rounded-sm bg-surface-muted" />
        <p aria-live="polite" className="sr-only" role="status">
          {title} is loading
        </p>
      </div>
      <main aria-hidden="true" className="space-y-3 px-4 py-4 sm:px-6 lg:px-6">
        {isDashboard ? <DashboardSkeleton /> : null}
        {isReport ? <ReportSkeleton /> : null}
        {!isDashboard && !isReport ? <ListSkeleton /> : null}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-28 animate-pulse rounded-md border border-border bg-surface"
            key={index}
          />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-80 animate-pulse rounded-md border border-border bg-surface" />
        <div className="h-80 animate-pulse rounded-md border border-border bg-surface" />
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3">
      <section className="rounded-md border border-border bg-surface">
        <div className="flex gap-2 border-b border-border p-3">
          <div className="h-8 w-40 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-surface-muted" />
          <div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-surface-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="grid grid-cols-4 gap-4 px-4 py-3" key={index}>
              <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
              <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
              <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
              <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-md border border-border bg-surface p-3">
        <div className="h-8 w-36 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-36 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="h-24 animate-pulse rounded-md border border-border bg-surface" />
        <div className="h-24 animate-pulse rounded-md border border-border bg-surface" />
        <div className="h-24 animate-pulse rounded-md border border-border bg-surface" />
      </div>
      <div className="h-[28rem] animate-pulse rounded-md border border-border bg-surface" />
    </div>
  );
}
