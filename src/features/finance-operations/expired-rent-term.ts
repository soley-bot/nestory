type RentTerm = { start_date: string; end_date: string };

/** Presentation only: the scoped context supplies authoritative, non-superseded terms.
 * Compare with the failed billing month, never today's date or current_leases' fallback.
 * A partial-month term can still legitimately generate prorated rent.
 */
export function expiredRentTermEndDate(
  errorCode: string,
  billingPeriodStart: string,
  terms: readonly RentTerm[],
): string | undefined {
  if (errorCode !== "billing_setup_missing" || !/^\d{4}-\d{2}-01$/.test(billingPeriodStart)) return;
  const [year, month] = billingPeriodStart.split("-").map(Number);
  if (month < 1 || month > 12) return;
  const monthEnd = `${billingPeriodStart.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  if (!terms.length || terms.some(term =>
    !isDate(term.start_date) || !isDate(term.end_date) || term.start_date > term.end_date
  )) return;
  if (terms.some(term => term.start_date <= monthEnd && term.end_date >= billingPeriodStart)) return;
  return terms.filter(term => term.end_date < billingPeriodStart)
    .map(term => term.end_date).sort().at(-1);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
