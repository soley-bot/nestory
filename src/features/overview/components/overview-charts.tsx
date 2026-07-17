"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  OverviewLedgerPoint,
  OverviewLeaseEndingPoint,
  OverviewOccupancyPoint,
} from "@/features/overview/overview.types";
import { formatMoney, type CurrencyCode } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const chartColors = [
  "var(--accent)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--chart-neutral)",
];

type NumberTooltipProps = Partial<TooltipContentProps> & {
  valueFormatter?: (value: number, name: string) => string;
};

export function OverviewOccupancyBars({
  limit = 5,
  points,
}: {
  limit?: number;
  points: OverviewOccupancyPoint[];
}) {
  const data = points.slice(0, limit);
  const maxOpenUnits = Math.max(1, ...data.map((point) => point.unoccupiedUnits));

  return (
    <div className="min-w-0 space-y-2">
      {data.map((point) => {
        const openPercent = Math.round((point.unoccupiedUnits / maxOpenUnits) * 100);

        return (
          <Link
            className="group block min-w-0 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-surface-muted"
            href={point.href}
            key={point.label}
            prefetch={false}
            title={`${point.label}: ${point.percent}% occupied, ${point.unoccupiedUnits} open units`}
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="min-w-0 truncate text-[13px] font-medium leading-5">
                {point.label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[13px] font-semibold leading-5 tabular-nums",
                  occupancyToneClass(point.percent),
                )}
              >
                {point.percent}%
              </span>
            </div>
            <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_92px] items-center gap-3">
              <div className="h-2 overflow-hidden rounded-full bg-chart-track">
                <span
                  className={cn(
                    "block h-full rounded-full transition-opacity group-hover:opacity-90",
                    openUnitsBarClass(point.percent),
                  )}
                  style={{ width: `${Math.max(openPercent, point.unoccupiedUnits > 0 ? 5 : 0)}%` }}
                />
              </div>
              <span className="text-right text-xs text-foreground-muted tabular-nums">
                {point.unoccupiedUnits}/{point.totalUnits} open
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground-subtle tabular-nums">
              {point.occupiedUnits}/{point.totalUnits} occupied
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export function OverviewLedgerAreaChart({
  className,
  currency,
  points,
}: {
  className?: string;
  currency: CurrencyCode;
  points: OverviewLedgerPoint[];
}) {
  return (
    <div className={cn("h-40 min-w-0", className)}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ bottom: 0, left: 0, right: 4, top: 6 }}>
          <defs>
            <linearGradient id="income-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="expense-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-neutral)" stopOpacity={0.22} />
              <stop offset="95%" stopColor="var(--chart-neutral)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            tickLine={false}
            tick={{ fill: "var(--foreground-subtle)", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value) => formatCompactMoney(Number(value), currency)}
            tickLine={false}
            tick={{ fill: "var(--foreground-subtle)", fontSize: 11 }}
            width={44}
          />
          <Tooltip
            content={(props) => (
              <OverviewTooltip
                {...props}
                valueFormatter={(value, name) => `${name}: ${formatMoney(value, currency)}`}
              />
            )}
          />
          <Area
            dataKey="income"
            fill="url(#income-fill)"
            name="Income"
            stroke="var(--accent)"
            strokeWidth={2}
            type="monotone"
          />
          <Area
            dataKey="expense"
            fill="url(#expense-fill)"
            name="Expense"
            stroke="var(--chart-neutral)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverviewMetricAreaChart({
  className,
  name = "Value",
  points,
  suffix = "",
  target,
}: {
  className?: string;
  name?: string;
  points: Array<{ label: string; value: number }>;
  suffix?: string;
  target?: number;
}) {
  if (points.length === 0) {
    return null;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const scaleMin =
    suffix === "%"
      ? Math.max(0, Math.floor((min - 8) / 10) * 10)
      : Math.max(0, min - range * 0.75);
  const scaleMax =
    suffix === "%"
      ? Math.min(100, Math.ceil(Math.max(max, target ?? max) / 10) * 10)
      : max + range * 0.75;
  const formatValue = (value: number) => `${value}${suffix}`;
  const data =
    target === undefined
      ? points
      : points.map((point) => ({ ...point, target }));

  return (
    <div className={cn("h-40 min-w-0", className)}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 4, top: 6 }}>
          <defs>
            <linearGradient id="percent-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            tickLine={false}
            tick={{ fill: "var(--foreground-subtle)", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            domain={[scaleMin, scaleMax]}
            tickFormatter={(value) => formatValue(Number(value))}
            tickLine={false}
            tick={{ fill: "var(--foreground-subtle)", fontSize: 11 }}
            width={38}
          />
          <Tooltip
            content={(props) => (
              <OverviewTooltip
                {...props}
                valueFormatter={(value, name) => `${name}: ${formatValue(value)}`}
              />
            )}
          />
          <Area
            dataKey="value"
            fill="url(#percent-fill)"
            name={name}
            stroke="var(--accent)"
            strokeWidth={2}
            type="monotone"
          />
          {target !== undefined ? (
            <Line
              dataKey="target"
              dot={false}
              name="Target"
              stroke="var(--chart-neutral)"
              strokeDasharray="4 4"
              strokeWidth={2}
              type="monotone"
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverviewLeaseEndingDonut({
  points,
}: {
  points: OverviewLeaseEndingPoint[];
}) {
  const data = points.map((point, index) => ({
    ...point,
    color: chartColors[index % chartColors.length],
  }));
  const total = points.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="grid min-w-0 grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
      <div className="relative h-32 min-w-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              cx="50%"
              cy="50%"
              data={data}
              dataKey="count"
              innerRadius={38}
              nameKey="label"
              outerRadius={58}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((point) => (
                <Cell fill={point.color} key={point.label} />
              ))}
            </Pie>
            <Tooltip content={(props) => <OverviewTooltip {...props} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-foreground-subtle">endings</span>
        </div>
      </div>
      <ul className="min-w-0 space-y-2">
        {data.map((point) => (
          <li
            className="flex min-w-0 items-center justify-between gap-2 text-xs"
            key={point.label}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: point.color }}
              />
              <span className="truncate text-foreground-muted">{point.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{point.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewTooltip({
  active,
  label,
  payload,
  valueFormatter,
}: NumberTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-sm">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry) => {
          const value = Number(entry.value ?? 0);
          const name = String(entry.name ?? entry.dataKey ?? "Value");
          return (
            <p
              className="flex items-center justify-between gap-3 text-foreground-muted"
              key={name}
            >
              <span>{name}</span>
              <span className="font-medium tabular-nums text-foreground">
                {valueFormatter ? valueFormatter(value, name) : value}
              </span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

function formatCompactMoney(amount: number, currency: CurrencyCode) {
  const absolute = Math.abs(amount);

  if (currency === "USD" && amount === 0) {
    return "$";
  }

  if (currency === "USD" && absolute >= 1_000) {
    return `${amount < 0 ? "-" : ""}${Math.round(absolute / 1_000)}k`;
  }

  return formatMoney(amount, currency);
}

function occupancyToneClass(percent: number) {
  if (percent < 50) {
    return "text-danger";
  }

  if (percent < 85) {
    return "text-warning";
  }

  return "text-success";
}

function openUnitsBarClass(percent: number) {
  if (percent < 50) {
    return "bg-danger/80";
  }

  if (percent < 85) {
    return "bg-warning/80";
  }

  return "bg-success/80";
}
