import Link from "next/link";
import {
  FUTURE_MODULES,
  type PlannedPageStatus,
} from "@/components/layout/future-modules";
import { PageHeader } from "@/components/layout/page-header";

const STATUS_ORDER: PlannedPageStatus[] = ["Planned", "Later"];

const STATUS_COPY: Record<PlannedPageStatus, string> = {
  Planned:
    "Important PMS surface area that should wait for stable data, rules, and relationships.",
  Later:
    "Useful once internal operations are dependable enough to automate or expose externally.",
};

function modulesByStatus(status: PlannedPageStatus) {
  return FUTURE_MODULES.filter((module) => module.status === status);
}

function StatusPill({ status }: { status: PlannedPageStatus }) {
  const tone =
    status === "Planned"
      ? "border-border bg-surface text-muted"
      : "border-border bg-muted/20 text-muted";

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium ${tone}`}
    >
      {status}
    </span>
  );
}

export default function RoadmapPage() {
  return (
    <div>
      <PageHeader
        description="A build plan for future PMS modules without letting them compete with the live property, unit, people, lease, timeline, and ledger surfaces."
        title="Roadmap"
      />

      <div className="px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="max-h-[calc(100vh-170px)] space-y-3 overflow-auto pr-1">
          <section className="rounded-md border border-border bg-surface p-4 lg:max-w-5xl">
            <div className="grid gap-3 text-sm leading-6 text-muted md:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
              <p>
                Nestory should grow from the record room first. The live
                navigation keeps focus on working surfaces; this page keeps
                future modules easy to find without making the app feel
                unfinished.
              </p>
              <div className="rounded-md border border-border bg-surface-muted p-3">
                <p className="text-xs font-semibold uppercase text-muted">
                  Current focus
                </p>
                <p className="mt-1 text-sm leading-6 text-foreground">
                  Complete history and performance of a property or unit, with
                  people and leases tied into that record.
                </p>
              </div>
            </div>
          </section>

        {STATUS_ORDER.map((status) => {
          const modules = modulesByStatus(status);

          return (
            <section
              className="rounded-md border border-border bg-surface lg:max-w-5xl"
              key={status}
            >
              <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={status} />
                    <h2 className="text-sm font-semibold text-foreground">
                      {status}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {STATUS_COPY[status]}
                  </p>
                </div>
                <p className="text-xs text-muted">
                  {modules.length} module{modules.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="divide-y divide-border">
                {modules.map((module) => (
                  <Link
                    className="grid gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-muted md:grid-cols-[160px_minmax(0,1fr)_minmax(220px,0.58fr)]"
                    href={module.path}
                    key={module.path}
                    prefetch={false}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {module.name}
                      </p>
                      <p className="mt-1 text-xs text-muted">{module.group}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="leading-6 text-foreground">
                        {module.summary}
                      </p>
                      <p className="mt-1 line-clamp-2 leading-5 text-muted">
                        {module.reason}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-surface p-2.5">
                      <p className="text-xs font-semibold uppercase text-muted">
                        Waits on
                      </p>
                      <p className="mt-1 line-clamp-3 leading-5 text-muted">
                        {module.recordRoomDependency}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
        </div>
      </div>
    </div>
  );
}
