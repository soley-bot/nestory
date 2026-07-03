import { PageHeader } from "@/components/layout/page-header";

const rowWidths = ["w-40", "w-24", "w-48", "w-48", "w-16"];

export function PeopleScreenSkeleton({
  description = "Operational people, company, tenant, owner, vendor, and staff records linked back to the work they support.",
  title = "People",
}: {
  description?: string;
  title?: string;
}) {
  return (
    <div
      aria-busy="true"
      className="min-h-screen lg:flex lg:h-screen lg:flex-col lg:overflow-hidden"
    >
      <span className="sr-only">Loading people records</span>
      <PageHeader
        actions={
          <>
            <div className="h-8 w-28 rounded-md border border-border bg-surface-muted" />
            <div className="h-8 w-24 rounded-md bg-foreground/10" />
          </>
        }
        description={description}
        title={title}
      />
      <div className="border-b border-border bg-surface px-4 py-2.5 sm:px-6 lg:px-6">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-muted" />
          <div className="flex items-center gap-2">
            <div className="hidden h-8 w-24 rounded-md border border-border bg-surface-muted md:block" />
            <div className="h-8 w-24 rounded-md border border-border bg-surface-muted" />
            <div className="h-8 w-20 rounded-md border border-border bg-surface-muted" />
          </div>
        </div>
      </div>
      <div className="px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:px-6 lg:py-4">
        <div className="grid min-h-0 items-stretch gap-3 lg:h-full xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-foreground/10" />
                <div className="h-3 w-72 max-w-full rounded bg-foreground/10" />
              </div>
              <div className="h-7 w-16 rounded-md border border-border bg-surface-muted" />
            </div>
            <div className="hidden h-full min-h-[380px] overflow-hidden rounded-md border border-border bg-surface md:block">
              <div className="grid grid-cols-[24%_16%_25%_26%_9%] bg-surface-muted px-2.5 py-2.5">
                {rowWidths.map((width, index) => (
                  <div
                    className={`h-3 rounded bg-foreground/10 ${width}`}
                    key={index}
                  />
                ))}
              </div>
              <div>
                {Array.from({ length: 8 }).map((_, rowIndex) => (
                  <div
                    className="grid min-h-[54px] grid-cols-[24%_16%_25%_26%_9%] items-center border-t border-border px-2.5"
                    key={rowIndex}
                  >
                    {rowWidths.map((width, columnIndex) => (
                      <div
                        className={`h-3 rounded bg-foreground/10 ${width}`}
                        key={columnIndex}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3 md:hidden">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  className="rounded-md border border-border bg-surface p-3.5"
                  key={index}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-md bg-surface-muted" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-40 rounded bg-foreground/10" />
                      <div className="h-3 w-28 rounded bg-foreground/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border bg-surface px-3 py-3">
              <div className="h-3 w-36 rounded bg-foreground/10" />
              <div className="h-8 w-44 rounded-md border border-border bg-surface-muted" />
            </div>
          </div>
          <aside className="hidden min-h-0 rounded-md border border-border bg-surface p-4 xl:block">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-foreground/10" />
                <div className="h-4 w-40 rounded bg-foreground/10" />
                <div className="h-3 w-28 rounded bg-foreground/10" />
              </div>
              <div className="h-5 w-14 rounded border border-border bg-surface-muted" />
            </div>
            <div className="mt-4 space-y-3">
              <div className="h-20 rounded-md border border-border bg-surface-muted" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 rounded-md border border-border bg-surface-muted" />
                <div className="h-16 rounded-md border border-border bg-surface-muted" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-8 rounded-md border border-border bg-surface-muted" />
                <div className="h-8 rounded-md border border-border bg-surface-muted" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
