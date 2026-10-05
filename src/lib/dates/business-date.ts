export function getBusinessDateValue(
  date = new Date(),
  timeZone = "Asia/Phnom_Penh",
) {
  const { day, month, year } = getBusinessDateParts(date, timeZone);

  return `${year}-${month}-${day}`;
}

export function getBusinessMonthValue(
  date = new Date(),
  timeZone = "Asia/Phnom_Penh",
) {
  const { month, year } = getBusinessDateParts(date, timeZone);

  return `${year}-${month}`;
}

function getBusinessDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    day: getPart("day"),
    month: getPart("month"),
    year: getPart("year"),
  };
}
