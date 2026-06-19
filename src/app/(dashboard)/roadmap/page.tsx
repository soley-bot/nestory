import Link from "next/link";
import {
  FileText,
  Landmark,
  Settings,
  Users,
} from "lucide-react";
import {
  FUTURE_MODULES,
  type PlannedPageStatus,
} from "@/components/layout/planned-page";
import { PageHeader } from "@/components/layout/page-header";

const STATUS_ORDER: PlannedPageStatus[] = ["Planned", "Later"];

const STATUS_COPY: Record<PlannedPageStatus, string> = {
  Planned:
    "Important PMS surface area that should wait for stable data, rules, and relationships.",
  Later:
    "Useful once internal operations are dependable enough to automate or expose externally.",
};

const availableSections = [
  {
    href: "/people",
    label: "People",
    detail: "Tenants, owners, vendors, and linked relationships.",
    icon: Users,
  },
  {
    href: "/ledger",
    label: "Ledger",
    detail: "Income, expense, balance, and transaction context.",
    icon: Landmark,
  },
  {
    href: "/documents",
    label: "Documents",
    detail: "Draft file-management surface for record-room attachments.",
    icon: FileText,
  },
  {
    href: "/reports",
    label: "Reports",
    detail: "Draft reporting surface for property and portfolio summaries.",
    icon: FileText,
  },
  {
    href: "/settings",
    label: "Settings",
    detail: "Workspace and display preferences.",
    icon: Settings,
  },
];

function modulesByStatus(status: PlannedPageStatus) {
  return FUTURE_MODULES.filter((module) => module.status === status);
}

function StatusPill({ status }: { status: PlannedPageStatus }) {
  const tone =
    status === "Planned"
      ? "border-border bg-white text-muted"
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

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:p-8">
        <section className="rounded-md border border-border bg-white p-5 lg:max-w-4xl">
          <div className="grid gap-4 text-sm leading-6 text-muted md:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
            <p>
              Nestory should grow from the record room first. The live
              navigation keeps focus on working surfaces; this page keeps the
              extra sections and future modules easy to find without making the
              app feel unfinished.
            </p>
            <div className="rounded-md border border-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase text-muted">
                Current focus
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                Complete history and performance of a property or unit, with
                people and leases tied into that record.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-white lg:max-w-5xl">
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-semibold uppercase text-muted">
              More available sections
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              These are live or draft sections that stay out of the shortest
              mobile rail.
            </p>
          </div>
          <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
            {availableSections.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="group flex min-h-24 gap-3 p-5 transition-colors hover:bg-surface-muted"
                  href={item.href}
                  key={item.href}
                  prefetch={false}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted group-hover:text-foreground">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-muted">
                      {item.detail}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {STATUS_ORDER.map((status) => {
          const modules = modulesByStatus(status);

          return (
            <section
              className="rounded-md border border-border bg-white lg:max-w-5xl"
              key={status}
            >
              <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={status} />
                    <h2 className="text-sm font-semibold text-foreground">
                      {status}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
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
                    className="grid gap-4 px-5 py-4 text-sm transition-colors hover:bg-surface-muted md:grid-cols-[180px_minmax(0,1fr)_minmax(240px,0.6fr)]"
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
                      <p className="mt-2 leading-6 text-muted">
                        {module.reason}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-surface p-3">
                      <p className="text-xs font-semibold uppercase text-muted">
                        Waits on
                      </p>
                      <p className="mt-2 leading-6 text-muted">
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
  );
}
