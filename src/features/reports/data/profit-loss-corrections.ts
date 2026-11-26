import type { OwnerProfitLossEvent } from "./owner-profit-loss-events.types";

/** Suppress only a fully offset original and its linked corrections within one report account. */
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
  const cancelled = new Set<string>();
  for (const [key, group] of reversals) {
    const original = byKey.get(key);
    if (!original || original.isReversal) continue;
    if (!group.every(event => event.organizationId === original.organizationId &&
      event.propertyId === original.propertyId && event.unitId === original.unitId &&
      event.periodStart === original.periodStart && event.currency === original.currency &&
      event.economicClass === original.economicClass && event.categoryId === original.categoryId &&
      event.categoryCode === original.categoryCode && event.categoryReportingGroup === original.categoryReportingGroup &&
      !reversals.has(event.eventKey))) continue;
    if (group.reduce((sum, event) => sum + event.signedAmountCents, original.signedAmountCents) !== BigInt(0)) continue;
    cancelled.add(key);
    for (const event of group) cancelled.add(event.eventKey);
  }
  return events.filter(event => !cancelled.has(event.eventKey));
}
