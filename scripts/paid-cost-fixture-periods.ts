export function paidCostFixtureDate(baseDate: string, offsetDays: number) {
  const [year, month, day] = baseDate.split("-").map(Number);
  const candidateDate = new Date(Date.UTC(year, month - 1, day + offsetDays))
    .toISOString()
    .slice(0, 10);
  const monthStart = `${baseDate.slice(0, 7)}-01`;
  return candidateDate < monthStart ? monthStart : candidateDate;
}

export function paidCostLifecycleOriginalDate(
  candidateDate: string,
  reversalDate: string,
) {
  const reversalMonthStart = `${reversalDate.slice(0, 7)}-01`;
  return candidateDate < reversalMonthStart ? reversalMonthStart : candidateDate;
}
