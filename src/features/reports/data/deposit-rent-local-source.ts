import { z } from "zod";
import { loadScopedFinanceContext, type ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { loadScopedLeaseContext } from "@/features/leases/data/scoped-lease-context";
import { buildApprovedDepositRentReport } from "./deposit-rent-approved-report";

export class LocalDepositExportError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 409, message: string) { super(message); }
}
export type LocalDepositClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }> };
export type LocalDepositScope = { organizationId: string; actorId: string; propertyIds: string[]; unitId?: string; periodStart: string; periodEnd: string };
const id = z.uuid();
const money = z.string().regex(/^-?\d{1,12}\.\d{2}$/);
const date = z.iso.date();
const sourceScope = { property_id: id, unit_id: id.nullable() };
const packetSchema = z.strictObject({
  version: z.literal(1), purpose: z.literal("deposit-rent-validation-only"), actorId: id, organizationId: id,
  propertyIds: z.array(id).min(1).max(100), unitId: id.nullable(), periodStart: date, periodEnd: date,
  consistency: z.literal("statement_snapshot"), complete: z.literal(true), fullOwnerProfitCertified: z.literal(false),
  fingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/),
  deposits: z.array(z.strictObject({ id, lease_id: id, ...sourceScope })).max(5000),
  events: z.array(z.strictObject({ id, lease_deposit_id: id, ...sourceScope,
    event_type: z.enum(["received", "refunded", "retained", "applied", "reversed"]), event_date: date,
    amount: money, currency: z.literal("USD"), reversal_of_id: id.nullable() })).max(5000),
  allocations: z.array(z.strictObject({ id, application_id: id, application_amount: money, deposit_event_id: id,
    lease_deposit_id: id, invoice_id: id, invoice_line_id: id, ...sourceScope, currency: z.literal("USD"), settlement_date: date,
    custodian: z.enum(["ips", "owner"]), owner_person_id: id.nullable(), signed_amount: money,
    reversal_of_allocation_id: id.nullable(), reversal_of_application_id: id.nullable(), custody_confirmation_id: id, line_type: z.literal("rent") })).max(5000),
  ownerBridges: z.array(z.strictObject({ applicationId: id, propertyOwnerId: id, ownerPersonId: id,
    liabilityAccountId: id, allocationSetId: id, custodian: z.enum(["ips", "owner"]),
    custodySignedAmount: money, ipsHeldSignedAmount: money, singleUnchangedOwner: z.literal(true) })).max(5000),
  census: z.strictObject({ leases: z.array(id).max(1000), deposits: z.array(id).max(5000), events: z.array(id).max(5000),
    allocations: z.array(id).max(5000), ownerBridges: z.array(id).max(5000) }),
});
function sameIds(actual: readonly string[], expected: readonly string[]) {
  const expectedIds = new Set(expected);
  return new Set(actual).size === actual.length && expectedIds.size === expected.length
    && actual.length === expected.length && actual.every(value => expectedIds.has(value));
}
function requireIds(actual: readonly string[], expected: readonly string[]) {
  if (!sameIds(actual, expected)) throw new LocalDepositExportError(409, "Source identity coverage changed or is incomplete. Refresh before exporting.");
}

// Ordinary session-bound RPCs only. No service client, direct-table fallback,
// finance-only reader or certification based merely on visible row counts.
export async function revalidateLocalDepositScope(client: LocalDepositClient, scope: LocalDepositScope) {
  const checkedClient: LocalDepositClient = { rpc: async (name, args) => {
    const result = await client.rpc(name, args);
    if (result.error) throw new LocalDepositExportError(result.error.code === "28000" ? 401 : result.error.code === "42501" ? 403 : 409,
      result.error.code === "42501" ? "Forbidden" : "Local report source is unavailable.");
    return result;
  } };
  // These existing loaders use rpc only. The narrow adapter does not obtain any
  // additional Supabase client capability; its runtime session is the same client.
  const readerClient = checkedClient as unknown as Parameters<typeof loadScopedFinanceContext>[0];
  const contexts: ScopedFinanceContext[] = [];
  for (const propertyId of scope.propertyIds) {
    const context = await loadScopedFinanceContext(readerClient, scope.organizationId, propertyId);
    if (!context.properties.some(property => property.id === propertyId)) throw new LocalDepositExportError(403, "Forbidden");
    if (scope.unitId && !context.units.some(unit => unit.id === scope.unitId && unit.property_id === propertyId)) throw new LocalDepositExportError(403, "Forbidden");
    contexts.push(context);
  }
  // current_leases omits roots without an authoritative term. The existing
  // checked recovery inventory includes those roots and archived leases too.
  const roots = new Map<string, { id: string; property_id: string }>();
  for (const root of contexts.flatMap(context => context.recovery_leases ?? context.leases)) {
    if (!scope.propertyIds.includes(root.property_id)) continue;
    if (roots.has(root.id) && roots.get(root.id)!.property_id !== root.property_id)
      throw new LocalDepositExportError(409, "Lease source parent scope mismatch.");
    roots.set(root.id, root);
  }
  const allLeaseIds = [...roots.keys()].sort();
  if (allLeaseIds.length > 1000) throw new LocalDepositExportError(409, "Narrow the lease scope before exporting.");
  const leaseContext = await loadScopedLeaseContext(readerClient, scope.organizationId, allLeaseIds);
  if (scope.propertyIds.some(propertyId => !leaseContext.properties.some(property => property.id === propertyId))) throw new LocalDepositExportError(403, "Forbidden");
  if (scope.unitId && !leaseContext.units.some(unit => unit.id === scope.unitId && unit.property_id === scope.propertyIds[0])) throw new LocalDepositExportError(403, "Forbidden");
  // lease_read_context validates every requested root and returns every scoped
  // non-null unit relationship in availability_leases, independent of terms.
  const leases = [...roots.values()].map(root => {
    const relationships = leaseContext.availability_leases.filter(lease => lease.id === root.id);
    if (relationships.length > 1) throw new LocalDepositExportError(409, "Duplicate lease unit relationship.");
    const unitId = relationships[0]?.unit_id ?? null;
    if (unitId && !leaseContext.units.some(unit => unit.id === unitId && unit.property_id === root.property_id))
      throw new LocalDepositExportError(409, "Lease unit parent scope mismatch.");
    const current = contexts.flatMap(context => context.leases).find(lease => lease.id === root.id);
    if (current && (current.property_id !== root.property_id || current.unit_id !== unitId))
      throw new LocalDepositExportError(409, "Lease source relationship changed. Refresh before exporting.");
    return { ...root, unit_id: unitId };
  }).filter(lease => !scope.unitId || lease.unit_id === null || lease.unit_id === scope.unitId);
  const leaseIds = leases.map(lease => lease.id).sort();
  return { checkedClient, leases, leaseIds, leaseContext };
}

export async function loadLocalDepositReport(client: LocalDepositClient, scope: LocalDepositScope, expectedFingerprint?: string) {
  const { checkedClient, leases, leaseIds, leaseContext } = await revalidateLocalDepositScope(client, scope);
  const response = await checkedClient.rpc("get_local_lease_deposit_report_snapshot", {
    p_organization_id: scope.organizationId, p_property_ids: [...scope.propertyIds].sort(),
    p_period_start: scope.periodStart, p_period_end: scope.periodEnd, p_unit_id: scope.unitId ?? null,
  });
  if (new TextEncoder().encode(JSON.stringify(response.data)).byteLength > 8_388_608) throw new LocalDepositExportError(409, "Local report source exceeds byte cap.");
  const parsed = packetSchema.safeParse(response.data);
  if (!parsed.success) throw new LocalDepositExportError(409, "Local report source is malformed or uncertified.");
  const packet = parsed.data;
  if (packet.actorId !== scope.actorId || packet.organizationId !== scope.organizationId || packet.unitId !== (scope.unitId ?? null)
    || packet.periodStart !== scope.periodStart || packet.periodEnd !== scope.periodEnd || !sameIds(packet.propertyIds, scope.propertyIds)) throw new LocalDepositExportError(409, "Source scope mismatch.");
  if (expectedFingerprint && expectedFingerprint !== packet.fingerprint) throw new LocalDepositExportError(409, "Source fingerprint changed. Refresh before exporting.");
  requireIds(packet.census.leases, leaseIds);
  requireIds(packet.deposits.map(row => row.id), packet.census.deposits);
  requireIds(packet.events.map(row => row.id), packet.census.events);
  requireIds(packet.allocations.map(row => row.id), packet.census.allocations);
  requireIds(packet.ownerBridges.map(row => row.applicationId), packet.census.ownerBridges);
  const expectedDeposits = leaseContext.deposits.filter(row => leaseIds.includes(row.lease_id));
  requireIds(packet.census.deposits, expectedDeposits.map(row => row.id));
  requireIds(packet.census.events, leaseContext.deposit_events.filter(row => expectedDeposits.some(deposit => deposit.id === row.lease_deposit_id)
    && row.event_date <= scope.periodEnd).map(row => row.id));
  for (const deposit of packet.deposits) {
    const lease = leases.find(row => row.id === deposit.lease_id);
    if (!lease || lease.property_id !== deposit.property_id || lease.unit_id !== deposit.unit_id) throw new LocalDepositExportError(409, "Deposit source parent scope mismatch.");
  }
  for (const row of [...packet.events, ...packet.allocations]) {
    const deposit = packet.deposits.find(deposit => deposit.id === row.lease_deposit_id);
    if (!deposit || row.property_id !== deposit.property_id || row.unit_id !== deposit.unit_id) throw new LocalDepositExportError(409, "Deposit source parent scope mismatch.");
  }
  const projection = buildApprovedDepositRentReport({ basis: "cash", scope, facts: [], deposits: packet,
    sourceRead: { complete: true, consistency: "verified", fingerprint: packet.fingerprint,
      sections: { income: "complete", expenses: "unverified", activity: "complete" } } },
  { generatedAt: new Date().toISOString(), expectedFingerprint: packet.fingerprint });
  if (projection.unlinkedAppliedEventIds.length) throw new LocalDepositExportError(409, "Unlinked deposit application requires review.");
  if (projection.model.incomeCents === null) throw new LocalDepositExportError(409, "Deposit settlement attribution is incomplete for this scope.");
  // Complete only for this bounded settlement report. Never certify whole-owner
  // profit or show absent expense families as zero.
  projection.report.title = "Local deposit rent settlement report - Cash basis";
  projection.report.description = "Local validation draft: applied deposits only; not a complete owner profit-and-loss report. No new bank receipt.";
  projection.report.exportFilenameBase = `local-deposit-rent-cash-${scope.periodStart}-${scope.periodEnd}`;
  projection.report.summary = projection.report.summary.slice(0, 1).map(metric => ({ ...metric, label: "Rent settled from deposits" }));
  return projection.report;
}
