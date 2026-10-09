// Synthetic transaction specification; no PostgreSQL proof or live command.
import { simulateDepositRentCommand } from './deposit-rent-command-model.mjs';
const copy = value => structuredClone(value);
const cents = value => { if (!/^-?\d+\.\d{2}$/.test(value)) throw new Error('exact cents required'); return BigInt(value.replace('.', '')); };
const money = value => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2,'0')}`;
export function simulateApprovedDepositRentCommand(state,user,command,options={}) {
  const result = simulateDepositRentCommand(state,user,command);
  const next = result.state;
  if (result.replay) {
    if (!next.ownerBridges.some(bridge => bridge.applicationId === result.id)) throw new Error('unpaired legacy replay');
    return result;
  }
  const owners = next.ownershipHistory.filter(owner => owner.startedOn <= command.date && (!owner.endedOn || owner.endedOn > next.firstDepositDate));
  const owner = owners[0];
  if (owners.length !== 1 || owner.percent !== '100.000' || owner.archived || !owner.personActive || !owner.ownerRoleActive
    || owner.startedOn > next.firstDepositDate || owner.endedOn && owner.endedOn <= command.date
    || next.custodian === 'owner' && next.custodyOwnerId !== owner.personId) throw new Error('single unchanged owner required');
  const application = next.applications.find(row => row.id === result.id);
  const signed = cents(application.amount) * (application.reversalOf ? -1n : 1n);
  const prior = application.reversalOf ? next.ownerBridges.find(row => row.applicationId === application.reversalOf) : undefined;
  if (application.reversalOf && (!prior || prior.propertyOwnerId !== owner.id || prior.ownerPersonId !== owner.personId
    || prior.liabilityAccountId !== application.liabilityAccountId)) throw new Error('original owner/account identity changed');
  if (prior && (prior.ownershipStartedOn !== owner.startedOn || prior.ownershipEndedOn !== owner.endedOn)) throw new Error('original owner assignment interval changed');
  if (prior && next.activeOwnerCashConsumers.includes(prior.applicationId)) throw new Error('active downstream owner cash consumer');
  if (cents(next.officialDepositCustody) !== cents(next.held) + signed) throw new Error('official custody does not reconcile');
  const movements = prior ? next.ownerMovements.filter(row => row.applicationId === prior.applicationId).map(row => ({
    ...copy(row), id: `movement-${result.id}-${row.order}`, applicationId: result.id, date: command.date,
    signedAmount: money(-cents(row.signedAmount)), reversalOfMovementId: row.id,
  })) : [{ id: `movement-${result.id}-1`, applicationId: result.id, propertyOwnerId: owner.id, ownerPersonId: owner.personId,
    component: 'security_deposit_custody', signedAmount: money(-signed), order: 1, date: command.date, reversalOfMovementId: null },
  ...(next.custodian === 'ips' ? [{ id: `movement-${result.id}-2`, applicationId: result.id, propertyOwnerId: owner.id, ownerPersonId: owner.personId,
    component: 'ips_held_owner_cash', signedAmount: money(signed), order: 2, date: command.date, reversalOfMovementId: null }] : [])];
  next.ownerMovements.push(...movements);
  // Fault after first bridge writes demonstrates all-or-nothing returned state.
  if (options.failAfterMovements) throw new Error('injected bridge write failure');
  next.ownerBridges.push({ applicationId: result.id, propertyOwnerId: owner.id, ownerPersonId: owner.personId,
    ownershipStartedOn: owner.startedOn,ownershipEndedOn: owner.endedOn,
    liabilityAccountId: application.liabilityAccountId, custodySignedAmount: money(-signed),
    ipsHeldSignedAmount: next.custodian === 'ips' ? money(signed) : '0.00', reversalOfApplicationId: application.reversalOf });
  next.officialDepositCustody = money(cents(next.officialDepositCustody) - signed);
  next.officialIpsHeld = money(cents(next.officialIpsHeld) + (next.custodian === 'ips' ? signed : 0n));
  next.bankReceiptCount = state.bankReceiptCount;
  next.bankCash = state.bankCash;
  return { ...result,state:next };
}
