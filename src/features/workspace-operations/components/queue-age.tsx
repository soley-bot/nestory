"use client";

import { useBusinessDate } from "@/lib/dates/business-date-provider";
import { formatDate } from "@/lib/dates/format";

/** Compare calendar days in the workspace timezone, including midnight boundaries. */
export function QueueAge({ value }: { value?: string }) {
  const { getBusinessDateValue } = useBusinessDate();
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return <span className="text-muted-foreground">—</span>;
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getBusinessDateValue(new Date(value));
  const today = getBusinessDateValue();
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  const label = days === 0 ? "Today" : days === 1 ? "Yesterday" : days > 1 ? `${days} days ago` : formatDate(day);
  return <time dateTime={value} title={formatDate(day)}>{label}</time>;
}
