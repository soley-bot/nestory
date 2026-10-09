import { normalizeDepositRentSources, type DepositRentAllocation, type DepositRentEvent } from "./deposit-rent-source";
import { buildOwnerReportModel, type OwnerReportFact } from "./owner-report-model";
import { presentOwnerReport } from "./owner-report-presentation";

type Input = Parameters<typeof buildOwnerReportModel>[0];
export type DepositRentOwnerBridge = {
  applicationId: string; propertyOwnerId: string; ownerPersonId: string; liabilityAccountId: string;
  allocationSetId: string; custodian: "ips" | "owner"; custodySignedAmount: string; ipsHeldSignedAmount: string;
  singleUnchangedOwner: true;
};

// Approved policy for local implementation/testing, not a live source loader.
// Authorization, snapshot consistency and coverage remain the caller's obligations.
export function buildApprovedDepositRentReport(input: Omit<Input, "facts"> & {
  facts: readonly OwnerReportFact[];
  deposits: { organizationId: string; events: readonly DepositRentEvent[]; allocations: readonly DepositRentAllocation[];
    ownerBridges: readonly DepositRentOwnerBridge[] };
}, presentation: Parameters<typeof presentOwnerReport>[1]) {
  const normalized = normalizeDepositRentSources(input.scope, input.deposits, "application_date");
  const bridges = new Map<string, DepositRentOwnerBridge>();
  for (const bridge of input.deposits.ownerBridges) {
    if (bridges.has(bridge.applicationId) || !bridge.singleUnchangedOwner || !bridge.propertyOwnerId || !bridge.ownerPersonId
      || !bridge.liabilityAccountId || !bridge.allocationSetId) throw new Error("Missing or duplicate verified single-owner bridge.");
    bridges.set(bridge.applicationId, bridge);
  }
  const applications = new Set(input.deposits.allocations.map(row => row.application_id));
  if (bridges.size !== applications.size) throw new Error("Deposit owner bridge coverage mismatch.");
  for (const row of input.deposits.allocations) {
    const bridge = bridges.get(row.application_id);
    const signed = row.reversal_of_application_id ? `-${row.application_amount}` : row.application_amount;
    const opposite = signed.startsWith("-") ? signed.slice(1) : `-${signed}`;
    if (!bridge || bridge.custodian !== row.custodian || bridge.custodySignedAmount !== opposite
      || bridge.ipsHeldSignedAmount !== (row.custodian === "ips" ? signed : "0.00")
      || row.custodian === "owner" && row.owner_person_id !== bridge.ownerPersonId) throw new Error("Deposit owner bridge conservation mismatch.");
    if (row.reversal_of_application_id) {
      const original = bridges.get(row.reversal_of_application_id);
      if (!original || original.ownerPersonId !== bridge.ownerPersonId || original.propertyOwnerId !== bridge.propertyOwnerId
        || original.liabilityAccountId !== bridge.liabilityAccountId) throw new Error("Reversal owner/account identity mismatch.");
    }
  }
  const depositSourceKeys = new Set(normalized.facts.map(fact => `${fact.sourceType}:${fact.sourceId}`));
  if (input.facts.some(fact => depositSourceKeys.has(`${fact.sourceType}:${fact.sourceId}`))) throw new Error("Duplicate deposit report source.");
  // Packet completeness never elevates an unverified source read into certification.
  const sourceRead = normalized.unlinkedAppliedEventIds.length && input.basis === "cash"
    ? { ...input.sourceRead, sections: { income: "incomplete" as const,
      expenses: input.sourceRead.sections?.expenses ?? (input.sourceRead.complete ? "complete" as const : "incomplete" as const),
      activity: input.sourceRead.sections?.activity } } : input.sourceRead;
  const model = buildOwnerReportModel({ ...input, sourceRead, facts: [...input.facts, ...normalized.facts] });
  const report = presentOwnerReport(model, presentation);
  for (const bridge of bridges.values()) {
    const application = input.deposits.allocations.find(row => row.application_id === bridge.applicationId)!;
    if (application.settlement_date < input.scope.periodStart || application.settlement_date > input.scope.periodEnd) continue;
    report.rows.push({ id: `owner-bridge:${bridge.applicationId}`, title: "Owner custody reclassification", cells: {
      date: application.settlement_date, type: "Owner custody reclassification", source: bridge.allocationSetId, amount: "",
      detail: `Application ${bridge.applicationId}; owner ${bridge.ownerPersonId}; assignment ${bridge.propertyOwnerId}; liability account ${bridge.liabilityAccountId}; ${bridge.custodian} custody. Deposit custody change ${bridge.custodySignedAmount}; IPS-held owner cash change ${bridge.ipsHeldSignedAmount}; new bank receipt 0.00.${application.reversal_of_application_id ? ` Reverses application ${application.reversal_of_application_id}.` : ""}` },
      sourceCount: 1, sourceLinks: [], sourceSummary: bridge.allocationSetId });
  }
  return { model, report, sourceCoverage: normalized.sourceCoverage,
    unlinkedAppliedEventIds: normalized.unlinkedAppliedEventIds, ownerBridges: [...bridges.values()] };
}
