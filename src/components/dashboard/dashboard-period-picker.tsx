import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardPeriodKey =
  | "current_month"
  | "last_month"
  | "last_30_days"
  | "qtd"
  | "ytd";

export type DashboardPeriodOption<TKey extends string = string> = {
  key: TKey;
  label: string;
  helper: string;
};

export const dashboardPeriodOptions: Array<DashboardPeriodOption<DashboardPeriodKey>> = [
  { key: "current_month", label: "Jul 2024", helper: "Current month" },
  { key: "last_month", label: "Jun 2024", helper: "Last month" },
  { key: "last_30_days", label: "Last 30 days", helper: "Rolling period" },
  { key: "qtd", label: "QTD", helper: "Quarter to date" },
  { key: "ytd", label: "YTD", helper: "Year to date" },
];

export function normalizeDashboardPeriod(
  value: string | string[] | undefined,
): DashboardPeriodKey {
  const period = Array.isArray(value) ? value[0] : value;

  return dashboardPeriodOptions.some((option) => option.key === period)
    ? (period as DashboardPeriodKey)
    : "current_month";
}

export function DashboardPeriodPicker<TKey extends string = string>({
  href,
  options,
  paramName = "period",
  selectedPeriod,
}: {
  href: string;
  options: Array<DashboardPeriodOption<TKey>>;
  paramName?: string;
  selectedPeriod: TKey;
}) {
  const selected =
    options.find((option) => option.key === selectedPeriod) ?? options[0];

  if (!selected) {
    return null;
  }

  return (
    <details className="group relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <CalendarDays size={15} />
        {selected.label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
        {options.map((option) => (
          <Link
            className={cn(
              "grid gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted",
              option.key === selectedPeriod ? "bg-surface-muted" : null,
            )}
            href={getDashboardPeriodHref(href, paramName, option.key)}
            key={option.key}
            prefetch={false}
          >
            <span className="text-[13px] font-semibold text-foreground">
              {option.label}
            </span>
            <span className="text-[11px] text-foreground-subtle">
              {option.helper}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

function getDashboardPeriodHref(
  href: string,
  paramName: string,
  value: string,
) {
  const separator = href.includes("?") ? "&" : "?";

  return `${href}${separator}${paramName}=${encodeURIComponent(value)}`;
}
