import { cn } from "@/lib/utils";

type ModuleLoadingProps = {
  heightMode?: "parent" | "viewport";
  kind?: "dashboard" | "list" | "report";
  title: string;
};

export function ModuleLoading({
  heightMode = "parent",
  kind = "list",
  title,
}: ModuleLoadingProps) {
  const isDashboard = kind === "dashboard";
  const isReport = kind === "report";

  return (
    <div
      aria-busy="true"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        heightMode === "viewport" ? "h-dvh" : "h-full",
      )}
      data-loading-kind={kind}
    >
      <div
        className="shrink-0 px-4 py-4 sm:px-6"
        data-slot="loading-header"
      >
        <div
          className="flex min-h-12 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-slot="loading-title-actions"
        >
          <div
            className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center"
            data-slot="loading-title-context"
          >
            <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
            <div className="h-6 w-52 max-w-full animate-pulse rounded-sm bg-muted" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <p aria-live="polite" className="sr-only" role="status">
            {title} is loading
          </p>
        </div>
      </div>
      <main
        aria-hidden="true"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6"
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
        className="grid min-h-28 shrink-0 gap-x-6 gap-y-3 md:grid-cols-4"
        data-slot="loading-summary"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="flex min-h-28 flex-col justify-center gap-3 py-3"
            key={index}
          >
            <div className="h-3 w-20 animate-pulse rounded-sm bg-muted" />
            <div className="h-7 w-28 max-w-full animate-pulse rounded-sm bg-muted" />
          </div>
        ))}
      </div>
      <div
        className="min-h-80 flex-1 animate-pulse bg-muted/60"
        data-slot="loading-work-surface"
      />
    </>
  );
}

function ListSkeleton() {
  return (
    <>
      <div
        className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 py-2"
        data-slot="loading-controls"
      >
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
        <div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>
      <section
        className="min-h-80 flex-1 divide-y divide-border"
        data-slot="loading-work-surface"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="grid grid-cols-4 gap-4 px-1 py-3" key={index}>
            <div className="h-4 animate-pulse rounded-sm bg-muted" />
            <div className="h-4 animate-pulse rounded-sm bg-muted" />
            <div className="h-4 animate-pulse rounded-sm bg-muted" />
            <div className="h-4 animate-pulse rounded-sm bg-muted" />
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
        className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 py-2"
        data-slot="loading-controls"
      >
        <div className="h-8 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>
      <div
        className="grid min-h-24 shrink-0 gap-x-6 gap-y-3 lg:grid-cols-3"
        data-slot="loading-summary"
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="flex min-h-24 flex-col justify-center gap-3 py-3"
            key={index}
          >
            <div className="h-3 w-20 animate-pulse rounded-sm bg-muted" />
            <div className="h-6 w-28 max-w-full animate-pulse rounded-sm bg-muted" />
          </div>
        ))}
      </div>
      <div
        className="min-h-[28rem] flex-1 animate-pulse bg-muted/60"
        data-slot="loading-work-surface"
      />
    </>
  );
}
