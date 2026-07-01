import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type {
  MaintenanceBadgeTone,
  MaintenanceSummary,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";

type MaintenanceBreakdownProps = {
  summary: MaintenanceSummary;
  viewQuery: MaintenanceViewQuery;
};

type ProgressItem = {
  href: string;
  label: string;
  tone: MaintenanceBadgeTone;
  value: number;
};

export function MaintenanceBreakdown({
  summary,
  viewQuery,
}: MaintenanceBreakdownProps) {
  const progressItems: ProgressItem[] = [
    {
      href: buildMaintenanceHref(viewQuery, { review: "all", status: "pending" }),
      label: "Pending",
      tone: summary.pending > 0 ? "warning" : "neutral",
      value: summary.pending,
    },
    {
      href: buildMaintenanceHref(viewQuery, {
        review: "all",
        status: "in_progress",
      }),
      label: "In progress",
      tone: summary.inProgress > 0 ? "accent" : "neutral",
      value: summary.inProgress,
    },
    {
      href: buildMaintenanceHref(viewQuery, { review: "overdue" }),
      label: "Overdue",
      tone: summary.overdue > 0 ? "danger" : "success",
      value: summary.overdue,
    },
    {
      href: buildMaintenanceHref(viewQuery, { review: "upcoming" }),
      label: "Upcoming",
      tone: summary.upcoming > 0 ? "warning" : "neutral",
      value: summary.upcoming,
    },
    {
      href: buildMaintenanceHref(viewQuery, { review: "completed" }),
      label: "Completed",
      tone: "success",
      value: summary.completed,
    },
    {
      href: buildMaintenanceHref(viewQuery, { review: "recurring" }),
      label: "Recurring",
      tone: summary.recurring > 0 ? "accent" : "neutral",
      value: summary.recurring,
    },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.05fr)_minmax(0,1.05fr)]">
      <section className="min-w-0 rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Progress</h2>
          <Badge tone={summary.reminderDue > 0 ? "danger" : "neutral"}>
            Reminders {summary.reminderDue}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {progressItems.map((item) => (
            <Link
              className="rounded-md border border-border px-2 py-1.5 text-[12px] transition-colors hover:bg-surface-muted"
              href={item.href}
              key={item.label}
              prefetch={false}
            >
              <span className="block text-muted">{item.label}</span>
              <Badge className="mt-1" tone={item.tone}>
                {item.value}
              </Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="min-w-0 rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">By property</h2>
          <span className="text-[11px] text-muted">Open / Pending / In progress</span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {summary.propertyStats.length === 0 ? (
            <p className="py-2 text-[13px] text-muted">No property cases yet.</p>
          ) : (
            summary.propertyStats.map((property) => (
              <Link
                className="flex min-w-0 items-center justify-between gap-3 py-2 text-[13px] transition-colors hover:bg-surface-muted"
                href={buildMaintenanceHref(viewQuery, {
                  propertyId: property.propertyId,
                  unitId: "all",
                })}
                key={property.propertyId}
                prefetch={false}
              >
                <span className="min-w-0 truncate font-medium">
                  {property.propertyLabel}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Badge tone={property.open > 0 ? "accent" : "neutral"}>
                    O {property.open}
                  </Badge>
                  <Badge tone={property.pending > 0 ? "warning" : "neutral"}>
                    P {property.pending}
                  </Badge>
                  <Badge tone={property.inProgress > 0 ? "accent" : "neutral"}>
                    IP {property.inProgress}
                  </Badge>
                  <Badge tone={property.overdue > 0 ? "danger" : "neutral"}>
                    OD {property.overdue}
                  </Badge>
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="min-w-0 rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">By unit</h2>
          <span className="text-[11px] text-muted">Open / Pending / In progress</span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {summary.unitStats.length === 0 ? (
            <p className="py-2 text-[13px] text-muted">No unit cases yet.</p>
          ) : (
            summary.unitStats.map((unit) => (
              <Link
                className="flex min-w-0 items-center justify-between gap-3 py-2 text-[13px] transition-colors hover:bg-surface-muted"
                href={buildMaintenanceHref(viewQuery, {
                  propertyId: unit.propertyId,
                  unitId: unit.unitId,
                })}
                key={unit.unitId}
                prefetch={false}
              >
                <span className="min-w-0 truncate font-medium">
                  {unit.unitLabel}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Badge tone={unit.open > 0 ? "accent" : "neutral"}>
                    O {unit.open}
                  </Badge>
                  <Badge tone={unit.pending > 0 ? "warning" : "neutral"}>
                    P {unit.pending}
                  </Badge>
                  <Badge tone={unit.inProgress > 0 ? "accent" : "neutral"}>
                    IP {unit.inProgress}
                  </Badge>
                  <Badge tone={unit.overdue > 0 ? "danger" : "neutral"}>
                    OD {unit.overdue}
                  </Badge>
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="min-w-0 rounded-md border border-border bg-surface p-3 xl:col-span-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Case mix</h2>
          <span className="text-[11px] text-muted">{viewQuery.month}</span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {summary.categoryStats.length === 0 ? (
            <p className="py-2 text-[13px] text-muted">No cases in this month.</p>
          ) : (
            summary.categoryStats.map((category) => (
              <Link
                className="flex min-w-0 items-center justify-between gap-3 py-2 text-[13px] transition-colors hover:bg-surface-muted"
                href={buildMaintenanceHref(viewQuery, {
                  month: viewQuery.month,
                  query: category.category,
                  review: "all",
                })}
                key={category.category}
                prefetch={false}
              >
                <span className="min-w-0 truncate font-medium">
                  {category.category}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge tone="neutral">{category.caseCount}</Badge>
                  <Badge tone="accent">{category.percentLabel}</Badge>
                </span>
              </Link>
            ))
          )}
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <h3 className="text-[12px] font-semibold">Repeated issues</h3>
          <div className="mt-1 divide-y divide-border">
            {summary.repeatedIssues.length === 0 ? (
              <p className="py-2 text-[13px] text-muted">No repeated pattern yet.</p>
            ) : (
              summary.repeatedIssues.map((issue) => (
                <Link
                  className="flex min-w-0 items-center justify-between gap-3 py-2 text-[13px] transition-colors hover:bg-surface-muted"
                  href={issue.href}
                  key={`${issue.propertyLabel}-${issue.unitLabel}-${issue.category}`}
                  prefetch={false}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{issue.category}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {issue.propertyLabel} / {issue.unitLabel} / {issue.scopeLabel}
                    </span>
                  </span>
                  <Badge tone="warning">{issue.caseCount}</Badge>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function buildMaintenanceHref(
  viewQuery: MaintenanceViewQuery,
  overrides: Partial<
    Pick<
      MaintenanceViewQuery,
      "month" | "propertyId" | "query" | "review" | "status" | "unitId"
    >
  >,
) {
  const params = new URLSearchParams();
  const propertyId = overrides.propertyId ?? viewQuery.propertyId;
  const unitId = overrides.unitId ?? viewQuery.unitId;
  const month = overrides.month ?? viewQuery.month;
  const query = overrides.query ?? "";
  const review = overrides.review ?? "open";
  const status = overrides.status ?? "all";

  if (propertyId !== "all") {
    params.set("propertyId", propertyId);
  }

  if (unitId !== "all") {
    params.set("unitId", unitId);
  }

  if (overrides.month) {
    params.set("month", month);
  }

  if (query) {
    params.set("query", query);
  }

  if (review !== "open") {
    params.set("review", review);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  const queryString = params.toString();

  return queryString ? `/maintenance?${queryString}` : "/maintenance";
}
