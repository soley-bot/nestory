import { PageHeader } from "@/components/layout/page-header";

export type PlannedPageStatus = "Planned" | "Later";

export type FutureModule = {
  name: string;
  path: string;
  status: PlannedPageStatus;
  group: string;
  summary: string;
  reason: string;
  recordRoomDependency: string;
};

type PlannedPageProps = {
  description: string;
  message: string;
  recordRoomDependency?: string;
  status?: PlannedPageStatus;
  title: string;
};

export const FUTURE_MODULES: FutureModule[] = [
  {
    name: "Payments",
    path: "/payments",
    status: "Planned",
    group: "Money",
    summary: "Tenant balances, rent collection, receipts, and payment history.",
    reason:
      "Payments come after lease obligations, balances, and accounting rules are dependable.",
    recordRoomDependency:
      "Needs lease terms, ledger structure, currency handling, receipt documents, and auditable balance changes.",
  },
  {
    name: "Tasks & maintenance",
    path: "/maintenance",
    status: "Planned",
    group: "Operations",
    summary:
      "Requests, repairs, assignments, vendor notes, and completion history.",
    reason:
      "Maintenance should attach to stable property, unit, tenant, lease, and record history instead of becoming a separate task tracker.",
    recordRoomDependency:
      "Needs the record room to identify the exact unit, lease period, prior repairs, documents, and ledger impact for each job.",
  },
  {
    name: "Communications",
    path: "/communications",
    status: "Planned",
    group: "Operations",
    summary:
      "Tenant, owner, and internal messages organized around the records they affect.",
    reason:
      "Messaging is useful only when it can be tied back to the right property, unit, person, lease, or maintenance record.",
    recordRoomDependency:
      "Needs stable people records, relationship context, documents, and linked activity history.",
  },
  {
    name: "Tenant portal",
    path: "/tenant-portal",
    status: "Later",
    group: "External access",
    summary: "A renter-facing place for balances, documents, requests, and messages.",
    reason:
      "External access should wait until internal tenant, lease, payment, maintenance, and messaging flows are reliable.",
    recordRoomDependency:
      "Needs tenant identity, lease context, balances, requests, documents, and safe access boundaries.",
  },
  {
    name: "Workflows",
    path: "/workflows",
    status: "Later",
    group: "Automation",
    summary:
      "Repeatable property operations once the underlying modules are stable.",
    reason:
      "Automation should codify proven workflows, not invent process before operators have used the core screens.",
    recordRoomDependency:
      "Needs mature activity history, statuses, ownership, due dates, notifications, and safe rollback paths.",
  },
];

function getModulePlan(title: string) {
  return FUTURE_MODULES.find(
    (module) => module.name.toLowerCase() === title.toLowerCase(),
  );
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

export function PlannedPage({
  description,
  message,
  recordRoomDependency,
  status,
  title,
}: PlannedPageProps) {
  const modulePlan = getModulePlan(title);
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
      <div className="px-4 py-5 sm:px-6 lg:p-8">
        <div className="grid gap-3 lg:max-w-4xl lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <section className="rounded-md border border-border bg-surface p-5 shadow-[0_18px_60px_rgba(8,11,18,0.035)]">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={plannedStatus} />
              <p className="text-xs font-medium uppercase text-muted">
                Future module
              </p>
            </div>
            <p className="mt-4 text-sm leading-6 text-foreground">{message}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{reason}</p>
          </section>

          <aside className="rounded-md border border-border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-muted">
              Record-room dependency
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">{dependency}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
