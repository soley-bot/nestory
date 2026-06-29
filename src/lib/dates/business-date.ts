const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  // ponytail: one MVP business timezone; pass organization timezone here when settings exist.
  timeZone: "Asia/Phnom_Penh",
  year: "numeric",
});

export function getBusinessDateValue(date = new Date()) {
  const { day, month, year } = getBusinessDateParts(date);

  return `${year}-${month}-${day}`;
}

export function getBusinessMonthValue(date = new Date()) {
  const { month, year } = getBusinessDateParts(date);

  return `${year}-${month}`;
}

function getBusinessDateParts(date: Date) {
  const parts = businessDateFormatter.formatToParts(date);
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    day: getPart("day"),
    month: getPart("month"),
    year: getPart("year"),
  };
}
