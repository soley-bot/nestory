"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { getMaintenanceListHref } from "../maintenance.hrefs";

import {
  type MaintenanceBadgeTone,
  type MaintenanceCategoryStat,
  type MaintenancePropertyStat,
  type MaintenanceSummary,
  type MaintenanceViewQuery,
} from "../maintenance.types";

type MaintenanceBreakdownProps = {
  summary: MaintenanceSummary;
  viewQuery: MaintenanceViewQuery;
};

type WidgetProps = {
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  href?: string;
  title: string;
};

type WidgetListRowProps = {
  helper: string;
  href: string;
  label: string;
  tone: MaintenanceBadgeTone;
  value: number | string;
};

export function MaintenanceBreakdown({ summary, viewQuery }: MaintenanceBreakdownProps) {
  const visibleCategoryStats = summary.categoryStats.slice(0, 4);
  const repeatedCategories = new Set(
    summary.repeatedIssues.map((issue) => issue.category.toLowerCase()),
  );
  const maxCategoryCases = Math.max(
    1,
    ...visibleCategoryStats.map((category) => category.caseCount),
  );
  const visiblePropertyStats = summary.propertyStats
    .toSorted((left, right) => {
      if (right.overdue !== left.overdue) return right.overdue - left.overdue;
      return right.open - left.open;
    })
    .slice(0, 4);
  const attentionItems = [
    {
      helper: "Past target",
      href: getMaintenanceListHref(viewQuery, { review: "overdue" }),
      label: "Overdue cases",
      tone: summary.overdue > 0 ? "danger" : "success",
      value: summary.overdue,
    },
    {
      helper: "Waiting on decision",
      href: getMaintenanceListHref(viewQuery, { status: "blocked" }),
      label: "Blocked cases",
      tone: summary.blocked > 0 ? "warning" : "success",
      value: summary.blocked,
    },
    {
      helper: "Due for follow-up",
      href: getMaintenanceListHref(viewQuery, { review: "reminders" }),
      label: "Reminders due",
      tone: summary.reminderDue > 0 ? "accent" : "neutral",
      value: summary.reminderDue,
    },
  ] satisfies WidgetListRowProps[];

  return (
    <div className="grid gap-3 xl:grid-cols-4">
      <DashboardWidget
        actionLabel="Open cases"
        className="xl:col-span-2"
        href={getMaintenanceListHref(viewQuery, { review: "open" })}
        title="Maintenance summary"
      >
        {visibleCategoryStats.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border bg-background/35">
            <div className="grid grid-cols-[minmax(0,1fr)_68px_80px_54px] border-b border-border bg-surface-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-foreground-subtle">
              <span>Category</span>
              <span className="text-right">Open</span>
              <span className="text-right">Share</span>
              <span className="text-right">Status</span>
            </div>
            {visibleCategoryStats.map((category) => {
              const isRepeated = repeatedCategories.has(category.category.toLowerCase());
              const tone = categoryTone(category, maxCategoryCases, isRepeated);

              return (
                <Link
                  className="grid grid-cols-[minmax(0,1fr)_68px_80px_54px] items-center border-b border-border px-3 py-3 text-sm last:border-b-0 hover:bg-surface-muted"
                  href={getMaintenanceListHref(viewQuery, {
                    query: category.category,
                    review: "open",
                  })}
                  key={category.category}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {category.category}
                    </span>
                    <span className="block truncate text-xs text-foreground-subtle">
                      {isRepeated ? "Repeated issue pattern" : "Standard service load"}
                    </span>
                  </span>
                  <span className="font-medium text-foreground text-right">
                    {category.caseCount}
                  </span>
                  <span className="flex items-center justify-end gap-2 text-xs text-foreground-subtle">
                    <span className="h-1.5 w-12 overflow-hidden bg-muted">
                      <span
                        className={cn("block h-full", toneBgClass(tone))}
                        style={{ width: percentLabelWidth(category.percentLabel) }}
                      />
                    </span>
                    {category.percentLabel}
                  </span>
                  <span className="flex justify-end">
                    <span
                      aria-label={tone}
                      className={cn("size-2.5 rounded-full", toneBgClass(tone))}
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyWidgetText>No open maintenance categories.</EmptyWidgetText>
        )}
      </DashboardWidget>

      <DashboardWidget
        actionLabel="View plan"
        href={getMaintenanceListHref(viewQuery, { status: "scheduled" })}
        title="Planned maintenance"
      >
        <div className="space-y-2">
          <WidgetListRow
            helper="Confirmed visits"
            href={getMaintenanceListHref(viewQuery, { status: "scheduled" })}
            label="Scheduled"
            tone={summary.scheduled > 0 ? "accent" : "neutral"}
            value={summary.scheduled}
          />
          <WidgetListRow
            helper="Coming up"
            href={getMaintenanceListHref(viewQuery, { review: "upcoming" })}
            label="Upcoming"
            tone={summary.upcoming > 0 ? "warning" : "neutral"}
            value={summary.upcoming}
          />
          <WidgetListRow
            helper="Repeating service"
            href={getMaintenanceListHref(viewQuery, { review: "recurring" })}
            label="Recurring"
            tone={summary.recurring > 0 ? "success" : "neutral"}
            value={summary.recurring}
          />
        </div>
      </DashboardWidget>

      <DashboardWidget
        actionLabel="View status"
        href={getMaintenanceListHref(viewQuery, { review: "open" })}
        title="Property status"
      >
        {visiblePropertyStats.length > 0 ? (
          <div className="space-y-1">
            {visiblePropertyStats.map((property) => {
              const tone = propertyStatusTone(property);

              return (
                <Link
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-2.5 text-sm last:border-b-0 hover:bg-surface-muted"
                  href={getMaintenanceListHref(viewQuery, {
                    propertyId: property.propertyId,
                    review: "open",
                  })}
                  key={property.propertyId}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {property.propertyLabel}
                    </span>
                    <span className="block truncate text-xs text-foreground-subtle">
                      {property.open} open / {property.overdue} overdue
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium text-foreground-subtle">
                    {property.completed} done
                    <span
                      aria-label={tone}
                      className={cn("size-2.5 rounded-full", toneBgClass(tone))}
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyWidgetText>No property maintenance activity.</EmptyWidgetText>
        )}
      </DashboardWidget>

      <DashboardWidget
        actionLabel="Open report"
        href={getMaintenanceListHref(viewQuery, { review: "open" })}
        title="Open cases"
      >
        <div className="space-y-4">
          <div>
            <div className="text-5xl font-semibold leading-none text-foreground">
              {summary.open}
            </div>
            <div className="mt-2 text-sm text-foreground-subtle">Active maintenance cases</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile
              label="Overdue"
              tone={summary.overdue > 0 ? "danger" : "success"}
              value={summary.overdue}
            />
            <MetricTile
              label="Due soon"
              tone={summary.upcoming > 0 ? "warning" : "neutral"}
              value={summary.upcoming}
            />
          </div>
        </div>
      </DashboardWidget>

      <DashboardWidget
        actionLabel="Review"
        href={getMaintenanceListHref(viewQuery, { review: "overdue" })}
        title="Attention"
      >
        <div className="space-y-2">
          {attentionItems.map((item) => (
            <WidgetListRow
              helper={item.helper}
              href={item.href}
              key={item.label}
              label={item.label}
              tone={item.tone}
              value={item.value}
            />
          ))}
        </div>
      </DashboardWidget>

      <DashboardWidget
        actionLabel="Open cases"
        className="xl:col-span-2"
        href={getMaintenanceListHref(viewQuery, { review: "open" })}
        title="Cost and mix"
      >
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-3 rounded-md border border-border bg-background/35 p-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-foreground-subtle">
                Actual cost
              </div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {summary.actualCostDisplay.primary}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-foreground-subtle">
                Estimated
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {summary.estimateCostDisplay.primary}
              </div>
            </div>
            <div className="border-t border-border pt-3 text-sm text-foreground-subtle">
              {summary.highCost} high-cost / {summary.highPriority} high-priority
            </div>
          </div>

          <div className="space-y-2">
            {visibleCategoryStats.length > 0 ? (
              visibleCategoryStats.map((category) => (
                <Link
                  className="block rounded-md border border-border bg-background/35 p-3 hover:bg-surface-muted"
                  href={getMaintenanceListHref(viewQuery, {
                    query: category.category,
                    review: "open",
                  })}
                  key={category.category}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {category.category}
                    </span>
                    <span className="shrink-0 text-foreground-subtle">
                      {category.caseCount} cases
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden bg-muted">
                    <div
                      className="h-full bg-accent"
                      style={{ width: percentLabelWidth(category.percentLabel) }}
                    />
                  </div>
                </Link>
              ))
            ) : (
              <EmptyWidgetText>No category mix yet.</EmptyWidgetText>
            )}
          </div>
        </div>
      </DashboardWidget>
    </div>
  );
}

function DashboardWidget({ actionLabel, children, className, href, title }: WidgetProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface shadow-sm", className)}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        {href && actionLabel ? (
          <Link className="shrink-0 text-sm font-medium text-accent hover:underline" href={href}>
            {actionLabel}
          </Link>
        ) : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function WidgetListRow({ helper, href, label, tone, value }: WidgetListRowProps) {
  return (
    <Link
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-background/35 p-3 text-sm hover:bg-surface-muted"
      href={href}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", toneBgClass(tone))} />
          <span className="truncate font-medium text-foreground">{label}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-foreground-subtle">{helper}</span>
      </span>
      <span className={cn("text-lg font-semibold", toneTextClass(tone))}>{value}</span>
    </Link>
  );
}

function MetricTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone: MaintenanceBadgeTone;
  value: number;
}) {
  return (
    <div className={cn("rounded-md border p-3", toneSoftClass(tone))}>
      <div className={cn("text-2xl font-semibold", toneTextClass(tone))}>{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.04em] text-foreground-subtle">
        {label}
      </div>
    </div>
  );
}

function EmptyWidgetText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-foreground-subtle">{children}</p>;
}

function categoryTone(
  category: MaintenanceCategoryStat,
  maxCategoryCases: number,
  isRepeated: boolean,
): MaintenanceBadgeTone {
  if (isRepeated) return "warning";
  if (category.caseCount === maxCategoryCases && maxCategoryCases > 1) return "danger";
  return "accent";
}

function propertyStatusTone(property: MaintenancePropertyStat): MaintenanceBadgeTone {
  if (property.overdue > 0) return "danger";
  if (property.open > 0) return "warning";
  return "success";
}

function toneSoftClass(tone: MaintenanceBadgeTone) {
  switch (tone) {
    case "accent":
      return "border-accent/30 bg-accent-soft";
    case "danger":
      return "border-danger/30 bg-danger-soft";
    case "success":
      return "border-success/30 bg-success-soft";
    case "warning":
      return "border-warning/30 bg-warning-soft";
    case "neutral":
    default:
      return "border-border bg-background/35";
  }
}

function toneBgClass(tone: MaintenanceBadgeTone) {
  switch (tone) {
    case "accent":
      return "bg-accent";
    case "danger":
      return "bg-danger";
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "neutral":
    default:
      return "bg-muted";
  }
}

function toneTextClass(tone: MaintenanceBadgeTone) {
  switch (tone) {
    case "accent":
      return "text-accent";
    case "danger":
      return "text-danger";
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "neutral":
    default:
      return "text-foreground-subtle";
  }
}

function percentLabelWidth(percentLabel: string) {
  const percent = Number.parseFloat(percentLabel);
  return Number.isFinite(percent) ? `${Math.min(100, Math.max(4, percent))}%` : "4%";
}
