export type EffectiveLeaseBillingRule = {
  archived_at?: string | null;
  created_at?: string;
  effective_from: string;
  effective_to: string | null;
  id?: string;
  rent_calculation_timezone: string | null;
};

export type LeaseBillingRuleState = "current" | "historical" | "scheduled";

export function getCalendarDateInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(date);
}

export function getLeaseBillingRuleCalendarDate<
  Rule extends EffectiveLeaseBillingRule,
>(rules: readonly Rule[], clock: Date) {
  const sortedRules = getActiveSortedRules(rules);
  let effectiveRule: Rule | undefined;
  let boundaryDate = getCalendarDateInTimeZone(
    clock,
    sortedRules[0]?.rent_calculation_timezone || "UTC",
  );

  for (const rule of sortedRules) {
    const boundaryTimeZone =
      effectiveRule?.rent_calculation_timezone ||
      rule.rent_calculation_timezone ||
      "UTC";
    boundaryDate = getCalendarDateInTimeZone(clock, boundaryTimeZone);

    if (rule.effective_from > boundaryDate) break;
    effectiveRule = rule;
  }

  if (!effectiveRule) return boundaryDate;

  const calendarDate = getCalendarDateInTimeZone(
    clock,
    effectiveRule.rent_calculation_timezone || "UTC",
  );
  return calendarDate < effectiveRule.effective_from
    ? effectiveRule.effective_from
    : calendarDate;
}

export function selectCurrentLeaseBillingRule<
  Rule extends EffectiveLeaseBillingRule,
>(rules: readonly Rule[], clock: Date): Rule | undefined {
  const calendarDate = getLeaseBillingRuleCalendarDate(rules, clock);

  return getActiveSortedRules(rules)
    .reverse()
    .find(
      (rule) =>
        rule.effective_from <= calendarDate &&
        (rule.effective_to === null || rule.effective_to >= calendarDate),
    );
}

export function selectCurrentLeaseBillingRulesByLeaseId<
  Rule extends EffectiveLeaseBillingRule & { lease_id: string },
>(rules: readonly Rule[], clock: Date) {
  const rulesByLeaseId = new Map<string, Rule[]>();

  for (const rule of rules) {
    const leaseRules = rulesByLeaseId.get(rule.lease_id) ?? [];
    leaseRules.push(rule);
    rulesByLeaseId.set(rule.lease_id, leaseRules);
  }

  const currentByLeaseId = new Map<string, Rule>();
  for (const [leaseId, leaseRules] of rulesByLeaseId) {
    const currentRule = selectCurrentLeaseBillingRule(leaseRules, clock);
    if (currentRule) currentByLeaseId.set(leaseId, currentRule);
  }
  return currentByLeaseId;
}

export function getLeaseBillingRuleState<Rule extends EffectiveLeaseBillingRule>(
  rule: Rule,
  rules: readonly Rule[],
  clock: Date,
): LeaseBillingRuleState {
  const calendarDate = getLeaseBillingRuleCalendarDate(rules, clock);

  if (rule.effective_to !== null && rule.effective_to < calendarDate) {
    return "historical";
  }
  if (rule.effective_from > calendarDate) return "scheduled";
  return "current";
}

function getActiveSortedRules<Rule extends EffectiveLeaseBillingRule>(
  rules: readonly Rule[],
) {
  return rules
    .filter((rule) => rule.archived_at == null)
    .sort(
      (left, right) =>
        left.effective_from.localeCompare(right.effective_from) ||
        (left.created_at ?? "").localeCompare(right.created_at ?? "") ||
        (left.id ?? "").localeCompare(right.id ?? ""),
    );
}
