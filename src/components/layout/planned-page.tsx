import { PageHeader } from "@/components/layout/page-header";
import {
  getFutureModulePlan,
  type PlannedPageStatus,
} from "@/components/layout/future-modules";

type PlannedPageProps = {
  description: string;
  message: string;
  recordRoomDependency?: string;
  status?: PlannedPageStatus;
  title: string;
};

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

export function PlannedPage({
  description,
  message,
  recordRoomDependency,
  status,
  title,
}: PlannedPageProps) {
  const modulePlan = getFutureModulePlan(title);
  const plannedStatus = status ?? modulePlan?.status ?? "Planned";
  const dependency =
    recordRoomDependency ??
    modulePlan?.recordRoomDependency ??
    "This module should attach to property and unit history once the core record room is stable.";
  const reason = modulePlan?.reason ?? message;

  return (
    <div>
      <PageHeader
        actions={<StatusPill status={plannedStatus} />}
        description={description}
        title={title}
      />
      <div className="px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.48fr)] lg:max-w-4xl">
          <section className="rounded-md border border-border bg-surface p-4 shadow-[0_18px_60px_rgba(8,11,18,0.035)]">
            <p className="text-sm leading-6 text-foreground">{message}</p>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted md:line-clamp-none">
              {reason}
            </p>
          </section>

          <aside className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase text-muted">
              Record-room dependency
            </p>
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted md:line-clamp-none">
              {dependency}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
