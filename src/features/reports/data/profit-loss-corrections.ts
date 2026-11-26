import type { OwnerProfitLossEvent } from "./owner-profit-loss-events.types";

/** Combine linked movements within one period and account, retaining every cent. */
export function effectiveProfitLossDetail(events: OwnerProfitLossEvent[]) {
  const byKey = new Map(events.map(event => [event.eventKey, event]));
  const reversals = new Map<string, OwnerProfitLossEvent[]>();
  for (const event of events) {
    if (!event.isReversal) continue;
    const key = `${event.reversalSourceType}:${event.reversalOfId}`;
    const group = reversals.get(key);
    if (group) group.push(event);
    else reversals.set(key, [event]);
  }
  const absorbed = new Set<string>();
  const amounts = new Map<string, bigint>();
  for (const [key, group] of reversals) {
    const original = byKey.get(key);
    if (!original || original.isReversal) continue;
    if (!group.every(event => event.organizationId === original.organizationId &&
      event.propertyId === original.propertyId && event.unitId === original.unitId &&
      event.periodStart === original.periodStart && event.currency === original.currency &&
      event.economicClass === original.economicClass && event.categoryId === original.categoryId &&
      event.categoryCode === original.categoryCode && event.categoryReportingGroup === original.categoryReportingGroup &&
      !reversals.has(event.eventKey))) continue;
    const amount = group.reduce((sum, event) => sum + event.signedAmountCents, original.signedAmountCents);
    amounts.set(key, amount);
    if (amount === BigInt(0)) absorbed.add(key);
    for (const event of group) absorbed.add(event.eventKey);
  }
  return events.filter(event => !absorbed.has(event.eventKey)).map(event => {
    const amount = amounts.get(event.eventKey);
    if (amount !== undefined) return { ...event, signedAmountCents: amount };
    return event.isReversal ? { ...event, description: event.categoryLabel } : event;
  });
}
