const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const calendarDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return calendarDateFormatter
      .formatToParts(new Date(`${value}T00:00:00Z`))
      .map((part) => part.type === "year" ? value.slice(0, 4) : part.value)
      .join("");
  }
  return dateFormatter.format(new Date(value));
}

export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return formatDate(value);
  }

  const [, year, month, day] = match;
  const monthLabel = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][Number(month) - 1];

  return `${day} ${monthLabel} ${year}`;
}

export function formatAuditTimestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}
