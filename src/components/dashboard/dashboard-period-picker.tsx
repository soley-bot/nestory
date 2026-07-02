import { DashboardPeriodPickerClient } from "@/components/dashboard/dashboard-period-picker-client";

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
    <DashboardPeriodPickerClient
      href={href}
      options={options}
      paramName={paramName}
      selectedPeriod={selectedPeriod}
    />
  );
}
