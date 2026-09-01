export function paidCostLifecycleOriginalDate(
  candidateDate: string,
  reversalDate: string,
) {
  const reversalMonthStart = `${reversalDate.slice(0, 7)}-01`;
  return candidateDate < reversalMonthStart ? reversalMonthStart : candidateDate;
}
