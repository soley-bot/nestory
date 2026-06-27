import type { ReportPropertyOption } from "@/features/reports/reports.types";

export function formatLongReportDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric",
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((dateParts, part) => {
      dateParts[part.type] = part.value;
      return dateParts;
    }, {});

  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

export function getReportScopeLabel(
  propertyId: string,
  propertyOptions: ReportPropertyOption[],
) {
  if (propertyId === "all") {
    return "All properties";
  }

  return (
    propertyOptions.find((property) => property.id === propertyId)?.label ??
    "Selected property"
  );
}

export function slugifyReportPart(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "report";
}
