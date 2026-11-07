export function activityPeriodError(from: string, to: string): string | null {
  for (const value of [from, to]) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Choose valid From and To dates.";
  }
  if (from > to) return "From must be on or before To.";
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > 366) return "Choose a period of 366 days or fewer.";
  return null;
}
