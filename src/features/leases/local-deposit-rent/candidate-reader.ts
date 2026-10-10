import "server-only";
import { z } from "zod";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
const uuid=z.uuid();const money=z.string().regex(/^\d{1,12}\.\d{2}$/);
const label=z.string().trim().min(1).max(120).refine(value=>!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(value));
export const localDepositCandidateSchema=z.strictObject({version:z.literal(1),purpose:z.literal("local-deposit-rent-candidates"),actorId:uuid,
  organizationId:uuid,leaseId:uuid,propertyId:uuid,unitId:uuid.nullable(),leaseLabel:label,businessDate:z.iso.date(),consistency:z.literal("statement_snapshot"),complete:z.literal(true),
  sourceHash:z.string().regex(/^[a-f0-9]{64}$/i),fingerprint:z.string().regex(/^[a-f0-9]{64}$/i),
  deposits:z.array(z.strictObject({id:uuid,leaseId:uuid,label,held:money,obligation:money,custodyVerified:z.boolean(),custodian:z.enum(["ips","owner"]).nullable(),
    singleUnchangedOwner:z.boolean(),custodyReconciles:z.boolean(),archived:z.boolean(),earliestDate:z.iso.date()})).max(100),
  invoices:z.array(z.strictObject({id:uuid,leaseId:uuid,label,outstanding:money,issued:z.boolean(),rentLines:z.array(z.strictObject({id:uuid,label,outstanding:money})).max(1000)})).max(100),
  applications:z.array(z.strictObject({id:uuid,depositId:uuid,invoiceId:uuid,label,amount:money,date:z.iso.date(),active:z.boolean(),consumed:z.boolean(),reversalOf:uuid.nullable()})).max(1000),
  closedMonths:z.array(z.string().regex(/^\d{4}-\d{2}$/)).max(1000),
  census:z.strictObject({deposits:z.array(uuid).max(100),invoices:z.array(uuid).max(100),rentLines:z.array(uuid).max(1000),events:z.array(uuid).max(5000),
    applications:z.array(uuid).max(1000),allocations:z.array(uuid).max(5000),custody:z.array(uuid).max(100),bridges:z.array(uuid).max(1000)}),
});
export type LocalDepositRentSnapshot=z.infer<typeof localDepositCandidateSchema>;
export function sameCandidateIds(actual:readonly string[],expected:readonly string[]){const set=new Set(expected);return new Set(actual).size===actual.length&&set.size===expected.length&&actual.length===expected.length&&actual.every(value=>set.has(value));}
export function parseLocalDepositCandidates(data:unknown,organizationId:string,leaseId:string){
  if(new TextEncoder().encode(JSON.stringify(data)).byteLength>8_388_608)throw Error("Candidate packet exceeds byte cap");
  const s=localDepositCandidateSchema.parse(data);
  if(s.organizationId!==organizationId||s.leaseId!==leaseId||s.deposits.some(row=>row.leaseId!==leaseId)||s.invoices.some(row=>row.leaseId!==leaseId)
    ||!sameCandidateIds(s.deposits.map(row=>row.id),s.census.deposits)||!sameCandidateIds(s.invoices.map(row=>row.id),s.census.invoices)
    ||!sameCandidateIds(s.invoices.flatMap(row=>row.rentLines.map(line=>line.id)),s.census.rentLines)
    ||!sameCandidateIds(s.applications.map(row=>row.id),s.census.applications)||!sameCandidateIds(s.census.bridges,s.census.applications)
    ||s.deposits.filter(row=>row.custodyVerified).length!==s.census.custody.length
    ||s.census.allocations.length<s.census.applications.length
    ||s.deposits.some(row=>row.custodyVerified&&row.custodian===null)||s.applications.some(row=>!s.census.deposits.includes(row.depositId)||!s.census.invoices.includes(row.invoiceId)
      ||row.reversalOf!==null&&!s.census.applications.includes(row.reversalOf)))throw Error("Candidate identity or parent scope incomplete");
  for(const ids of Object.values(s.census))if(new Set(ids).size!==ids.length)throw Error("Candidate census duplicates");
  return s;
}
export async function readLocalDepositRentSnapshot(client:LocalDepositClient,organizationId:string,leaseId:string){
  if(!uuid.safeParse(organizationId).success||!uuid.safeParse(leaseId).success)throw Error("Explicit lease scope required");
  const result=await client.rpc("get_local_deposit_rent_candidates",{p_organization_id:organizationId,p_lease_id:leaseId});
  if(result.error)throw Error("Local deposit rent candidates unavailable");
  return parseLocalDepositCandidates(result.data,organizationId,leaseId);
}
