type ModuleLoadingProps = {
  kind?: "dashboard" | "list" | "report";
  title: string;
};

export function ModuleLoading({ kind = "list", title }: ModuleLoadingProps) {
  const isDashboard = kind === "dashboard";
  const isReport = kind === "report";

  return (
    <div
      aria-busy="true"
      className="min-h-screen bg-background"
      data-loading-kind={kind}
    >
      <div
        className="px-4 py-4 sm:px-6"
        data-slot="loading-header"
      >
        <div
          className="flex min-h-12 flex-wrap items-end justify-between gap-3"
          data-slot="loading-title-actions"
        >
          <div className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-muted" />
            <div className="h-6 w-52 animate-pulse rounded-sm bg-surface-muted" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-md bg-surface-muted" />
          <p aria-live="polite" className="sr-only" role="status">
            {title} is loading
          </p>
        </div>
      </div>
      <main
        aria-hidden="true"
        className="space-y-3 px-4 py-4 sm:px-6 lg:px-6"
        data-slot="loading-workspace"
      >
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
      <div
        className="grid min-h-28 gap-x-6 gap-y-3 md:grid-cols-4"
        data-slot="loading-summary"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="flex min-h-28 flex-col justify-center gap-3 py-3"
            key={index}
          >
            <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-muted" />
            <div className="h-7 w-28 max-w-full animate-pulse rounded-sm bg-surface-muted" />
          </div>
        ))}
      </div>
      <div
        className="h-80 animate-pulse bg-surface-muted/60"
        data-slot="loading-work-surface"
      />
    </>
  );
}

function ListSkeleton() {
  return (
    <>
      <div
        className="flex min-h-14 flex-wrap items-center gap-2 py-2"
        data-slot="loading-controls"
      >
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-surface-muted" />
        <div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-surface-muted" />
      </div>
      <section
        className="min-h-80 divide-y divide-border"
        data-slot="loading-work-surface"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="grid grid-cols-4 gap-4 px-1 py-3" key={index}>
            <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
            <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
            <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
            <div className="h-4 animate-pulse rounded-sm bg-surface-muted" />
          </div>
        ))}
      </section>
    </>
  );
}

function ReportSkeleton() {
  return (
    <>
      <div
        className="flex min-h-14 flex-wrap items-center gap-2 py-2"
        data-slot="loading-controls"
      >
        <div className="h-8 w-36 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-36 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div
        className="grid min-h-24 gap-x-6 gap-y-3 lg:grid-cols-3"
        data-slot="loading-summary"
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="flex min-h-24 flex-col justify-center gap-3 py-3"
            key={index}
          >
            <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-muted" />
            <div className="h-6 w-28 max-w-full animate-pulse rounded-sm bg-surface-muted" />
          </div>
        ))}
      </div>
      <div
        className="h-[28rem] animate-pulse bg-surface-muted/60"
        data-slot="loading-work-surface"
      />
    </>
  );
}
