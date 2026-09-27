"use server";

import { requireOwnerBalanceReadContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getOwnerCloseData } from "@/features/owner-close/data/owner-close";
import { loadOwnerStatementPublication } from "@/features/reports/data/owner-statement-report";
import { ownerStatementCash } from "@/features/reports/data/owner-statement-cash";
import { getOwnerBalanceData } from "./data/owner-balances";
import { isStatementReportEnabled } from "./statement-report-enabled";
import type { OwnerStatementLine } from "@/features/reports/data/owner-statement-report";

export async function readStatementReport(input: { month: string; ownerPersonId: string; propertyId: string }) {
  const context = await requireOwnerBalanceReadContext();
  if (!isStatementReportEnabled(context)) throw new Error("Statement report is not enabled for this workspace.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || !uuid.test(input.ownerPersonId) || !uuid.test(input.propertyId)) throw new Error("Invalid statement scope.");
  const data = await getOwnerCloseData({ currency: "USD", monthStart: `${input.month}-01`, ownerPersonId: input.ownerPersonId, propertyId: input.propertyId });
  const publication = data.publications.filter(item => !item.supersededByPublicationId).sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  if (!publication) {
    const balance = await getOwnerBalanceData({ currency: "USD", periodStart: `${input.month}-01`, periodEnd: `${input.month}-01`, ownerPersonId: input.ownerPersonId, propertyId: input.propertyId });
    const period = balance.periods.find(item => item.monthStart === `${input.month}-01` && (item.status === "ready" || item.status === "closed"));
    if (!period) return null;
    const lines: OwnerStatementLine[] = balance.sources.flatMap(source => source.movements.map(movement => ({ id: movement.id, lineNumber: 0, businessDate: source.eventDate, component: movement.component, description: source.sourceType.replaceAll("_", " "), lineKind: "movement" as const, signedAmount: movement.signedAmount, sourceCount: 1, sources: [{ id: source.allocationSetId, sourceFingerprint: source.sourceFingerprint, sourceId: source.sourceId, sourceLineId: source.sourceLineId, sourceType: source.sourceType }] }))).map((line, index) => ({ ...line, lineNumber: index + 1 }));
    return { cash: ownerStatementCash({ components: period.components, lines }), statementNumber: "Draft", artifacts: [] as { id: string; format: "pdf" | "xlsx" }[], stale: false, published: false };
  }
  const client = await createSupabaseServerClient();
  const model = await loadOwnerStatementPublication(client, context.organizationId, publication.id);
  if (model.organizationId !== context.organizationId || model.ownerPersonId !== input.ownerPersonId || model.propertyId !== input.propertyId || model.monthStart !== `${input.month}-01`) throw new Error("Statement scope mismatch.");
  return { cash: ownerStatementCash(model), statementNumber: model.statementNumber, artifacts: model.artifacts.map(item => ({ id: item.id, format: item.format })), stale: data.series?.state === "stale", published: true };
}
